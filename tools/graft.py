#!/usr/bin/env python3
import argparse
import json
import os
import re
import struct
import subprocess
import sys

SEG_CMD = 0x19
MASK = 0x3FFFFFF
FRIDA = "__FRIDA_"
STASH = "__XFRIDA_"


def load(path):
    with open(path, "rb") as handle:
        return bytearray(handle.read())


def parse_segments(data):
    ncmds = struct.unpack_from("<I", data, 16)[0]
    offset = 32
    segments = []
    for _ in range(ncmds):
        cmd, size = struct.unpack_from("<II", data, offset)
        if cmd == SEG_CMD:
            name = bytes(data[offset + 8:offset + 24]).split(b"\x00")[0].decode("utf-8", "replace")
            vmaddr, vmsize, fileoff, filesize = struct.unpack_from("<QQQQ", data, offset + 24)
            nsec = struct.unpack_from("<I", data, offset + 64)[0]
            segments.append({
                "cmd": offset,
                "name": name,
                "vmaddr": vmaddr,
                "vmsize": vmsize,
                "fileoff": fileoff,
                "filesize": filesize,
                "nsec": nsec,
            })
        offset += size
    return segments, ncmds


def set_name(data, offset, name):
    data[offset:offset + 16] = name.encode().ljust(16, b"\x00")[:16]


def rename_segments(data, predicate, mapper):
    segments, _ = parse_segments(data)
    changed = 0
    for segment in segments:
        if not predicate(segment["name"]):
            continue
        new = mapper(segment["name"])
        set_name(data, segment["cmd"] + 8, new)
        cursor = segment["cmd"] + 72
        for _ in range(segment["nsec"]):
            sect = bytes(data[cursor + 16:cursor + 32]).split(b"\x00")[0].decode("utf-8", "replace")
            if sect.startswith(FRIDA) or sect.startswith(STASH):
                set_name(data, cursor + 16, new)
            cursor += 80
        changed += 1
    return changed


def parse_offsets(text):
    result = []
    seen = set()
    for raw in re.split(r"[\n;,]+", text):
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        match = None
        for match in re.finditer(r"0[xX][0-9a-fA-F]+", line):
            pass
        if match is None:
            digits = re.search(r"\b([0-9a-fA-F]{4,})\b", line)
            if digits is None:
                raise SystemExit("bad offset line: %s" % raw)
            value = int(digits.group(1), 16)
            name = line[:digits.start()].strip(" =\t")
        else:
            value = int(match.group(0), 16)
            name = line[:match.start()].strip(" =\t")
        if value in seen:
            continue
        seen.add(value)
        result.append({"name": name or ("sub_%x" % value), "rva": value})
    if not result:
        raise SystemExit("no offsets parsed")
    return result


def branch_target(data, rva):
    word = struct.unpack_from("<I", data, rva)[0]
    if (word >> 26) not in (0b000101, 0b100101):
        return None
    imm = word & MASK
    if imm >> 25:
        imm -= 1 << 26
    return rva + imm * 4


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", required=True)
    parser.add_argument("--offsets", required=True, help="file with name=0xRVA lines")
    parser.add_argument("--tool", default="./gum-graft")
    parser.add_argument("--out", required=True)
    parser.add_argument("--report", default="graft-report.json")
    args = parser.parse_args()

    with open(args.offsets, "r", encoding="utf-8") as handle:
        hooks = parse_offsets(handle.read())

    data = load(args.binary)
    segments, _ = parse_segments(data)
    text = next((s for s in segments if s["name"] == "__TEXT"), None)
    if text is None:
        raise SystemExit("no __TEXT segment")
    text_limit = text["vmsize"]

    for hook in hooks:
        if hook["rva"] % 4:
            raise SystemExit("unaligned rva 0x%x" % hook["rva"])
        if hook["rva"] >= text_limit:
            raise SystemExit("rva 0x%x outside __TEXT" % hook["rva"])

    stashed = rename_segments(data, lambda name: name.startswith(FRIDA), lambda name: STASH + name[len(FRIDA):])
    with open(args.binary, "wb") as handle:
        handle.write(data)

    command = [args.tool, args.binary]
    for hook in hooks:
        command.extend(["-i", hex(hook["rva"])])
    run = subprocess.run(command, capture_output=True, text=True)
    sys.stdout.write(run.stdout)
    if run.returncode != 0:
        sys.stderr.write(run.stderr)
        raise SystemExit("gum-graft failed with %d" % run.returncode)

    data = load(args.binary)
    segments, _ = parse_segments(data)
    indexes = [0]
    for segment in segments:
        found = re.match(r"__(?:X)?FRIDA_(TEXT|DATA)(\d+)$", segment["name"])
        if found:
            indexes.append(int(found.group(2)) + 1)
    new_index = max(indexes)

    def promote(name):
        kind = "DATA" if "DATA" in name else "TEXT"
        return "__FRIDA_%s%d" % (kind, new_index)

    rename_segments(data, lambda name: name.startswith(FRIDA), promote)
    rename_segments(data, lambda name: name.startswith(STASH), lambda name: FRIDA + name[len(STASH):])

    with open(args.binary, "wb") as handle:
        handle.write(data)

    data = load(args.binary)
    segments, ncmds = parse_segments(data)
    base = 0x100000000
    issues = []
    for segment in segments:
        if segment["filesize"] and segment["fileoff"] + segment["filesize"] > len(data):
            issues.append("overflow: " + segment["name"])
        if segment["name"] != "__PAGEZERO" and (segment["vmaddr"] % 0x4000 or segment["vmsize"] % 0x4000):
            issues.append("align: " + segment["name"])

    tramp = next((s for s in segments if s["name"] == "__FRIDA_TEXT%d" % new_index), None)
    rows = []
    for hook in hooks:
        target = branch_target(data, hook["rva"])
        ok = tramp is not None and tramp["vmaddr"] <= base + target < tramp["vmaddr"] + tramp["vmsize"]
        hook["trampoline"] = hex(base + target) if target else None
        hook["ok"] = bool(ok)
        if not ok:
            issues.append("hook: " + hook["name"])
        rows.append(hook)

    report = {
        "binary": os.path.basename(args.binary),
        "size": len(data),
        "ncmds": ncmds,
        "stashed_segments": stashed,
        "new_segment_index": new_index,
        "frida_text": hex(tramp["vmaddr"]) if tramp else None,
        "hooks": rows,
        "issues": issues,
    }
    with open(args.report, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)

    for hook in rows:
        print("%-44s %-10s -> %s %s" % (hook["name"], hex(hook["rva"]), hook["trampoline"], "ok" if hook["ok"] else "FAIL"))
    print("__FRIDA_TEXT%d @ %s" % (new_index, report["frida_text"]))
    if issues:
        print("ISSUES: " + ", ".join(issues))
        raise SystemExit(1)


if __name__ == "__main__":
    main()

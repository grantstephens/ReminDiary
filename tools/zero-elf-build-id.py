#!/usr/bin/env python3
"""Zero the GNU build-id note in every stored .so entry of an APK, in place.

The Android NDK's linker embeds a 20-byte SHA-1-shaped `.note.gnu.build-id`
in every shared library. It is *not* a hash of the final file - it is
computed mid-link, before debug-symbol stripping, so it can differ between
two otherwise byte-identical builds even when every other byte of the
library matches (confirmed empirically: diffing a real F-Droid buildserver
build against ReminDiary's own GitHub-released reference showed this was
the *only* difference in five of six native libraries). Neither side's
build is "correct" - the value carries no information once symbols are
stripped, so it is zeroed rather than fixed to a particular hash.

Patches bytes directly inside the existing ZIP entries (no re-packaging),
which is what preserves this script's own moral requirement: apksigcopier's
signature-transplant scheme needs the two APKs' local-file-entry regions to
land at the same byte length, so anything that repacks (recompresses,
reorders, or resizes unrelated entries) would break reproducibility instead
of fixing it. Only .so entries are touched, and only when stored
uncompressed (true for every native lib in a modern APK) - CRC32 in both
the local file header and the central directory record is recomputed to
match, since the content changed.
"""

import struct
import sys
import zipfile
import zlib


def zero_build_id(data: bytearray) -> int:
    if data[:4] != b"\x7fELF":
        return 0
    is64 = data[4] == 2
    if is64:
        e_phoff = struct.unpack_from("<Q", data, 32)[0]
        e_phentsize = struct.unpack_from("<H", data, 54)[0]
        e_phnum = struct.unpack_from("<H", data, 56)[0]
    else:
        e_phoff = struct.unpack_from("<I", data, 28)[0]
        e_phentsize = struct.unpack_from("<H", data, 42)[0]
        e_phnum = struct.unpack_from("<H", data, 44)[0]

    PT_NOTE = 4
    zeroed = 0
    for i in range(e_phnum):
        ph = e_phoff + i * e_phentsize
        if is64:
            p_type, _flags, p_offset, _vaddr, _paddr, p_filesz = struct.unpack_from(
                "<IIQQQQ", data, ph
            )
        else:
            p_type, p_offset, _vaddr, _paddr, p_filesz = struct.unpack_from(
                "<IIIII", data, ph
            )
        if p_type != PT_NOTE:
            continue
        pos = p_offset
        end = p_offset + p_filesz
        while pos < end:
            namesz, descsz, ntype = struct.unpack_from("<III", data, pos)
            name_start = pos + 12
            name_pad = (namesz + 3) & ~3
            desc_start = name_start + name_pad
            desc_pad = (descsz + 3) & ~3
            if bytes(data[name_start : name_start + namesz]) == b"GNU\x00" and ntype == 3:
                data[desc_start : desc_start + descsz] = b"\x00" * descsz
                zeroed += 1
            pos = desc_start + desc_pad
    return zeroed


def patch_apk(path: str) -> None:
    with zipfile.ZipFile(path) as zf:
        entries = [
            info
            for info in zf.infolist()
            if info.filename.endswith(".so") and info.compress_type == zipfile.ZIP_STORED
        ]
        cd_start = zf.start_dir

    total = 0
    with open(path, "r+b") as f:
        for info in entries:
            f.seek(info.header_offset + 26)
            name_len, extra_len = struct.unpack("<HH", f.read(4))
            data_offset = info.header_offset + 30 + name_len + extra_len

            f.seek(data_offset)
            data = bytearray(f.read(info.compress_size))
            n = zero_build_id(data)
            if n == 0:
                continue
            total += n
            new_crc = zlib.crc32(bytes(data)) & 0xFFFFFFFF

            f.seek(data_offset)
            f.write(data)

            f.seek(info.header_offset + 14)
            f.write(struct.pack("<I", new_crc))

            cd_offset = _find_central_directory_entry(f, cd_start, info.filename)
            f.seek(cd_offset + 16)
            f.write(struct.pack("<I", new_crc))

    print(f"{path}: zeroed {total} build-id note(s) in {len(entries)} candidate .so entries")


def _find_central_directory_entry(f, cd_start: int, filename: str) -> int:
    target = filename.encode()
    pos = cd_start
    while True:
        f.seek(pos)
        sig = f.read(4)
        if sig != b"PK\x01\x02":
            raise ValueError(f"central directory entry for {filename!r} not found")
        f.seek(pos + 28)
        name_len, extra_len, comment_len = struct.unpack("<HHH", f.read(6))
        f.seek(pos + 46)
        name = f.read(name_len)
        if name == target:
            return pos
        pos += 46 + name_len + extra_len + comment_len


if __name__ == "__main__":
    for apk_path in sys.argv[1:]:
        patch_apk(apk_path)

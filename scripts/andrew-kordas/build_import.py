#!/usr/bin/env python3
"""Build the Andrew Kordas import files from a tunebook export.

Usage:
  python3 scripts/andrew-kordas/build_import.py --export ~/Downloads/tunebook-ref.abc

Writes into scripts/andrew-kordas/output/:
  kordas-tag-updates.abc  existing records, verbatim, with the tag appended and
                          lastupdated bumped so Add > File classifies them as updates
  kordas-new-tunes.abc    new records with link, notation (where found) and the
                          auto-enrich flag so the first open runs the Add search
"""

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
HEADER_RE = re.compile(r'^([A-Za-z]):')
VOICE_RE = re.compile(r'^V: ?(\S+)')
MAX_VOICES = 4


def split_blocks(text):
    parts = re.split(r'\n(?=X: ?\d+[ \t]*\n)', '\n' + text)
    return [p.strip('\n') for p in parts if re.match(r'X: ?\d+', p.strip('\n'))]


def block_x(block):
    return re.match(r'X: ?(\d+)', block).group(1)


def block_titles(block):
    return [line[2:].strip() for line in block.splitlines() if line.startswith('T:')]


def block_tags(block):
    for line in block.splitlines():
        if line.startswith('% abcbook-tags'):
            value = line[len('% abcbook-tags'):].strip()
            return [t for t in value.split(',') if t] if value else []
    return []


def resolve_targets(blocks, entry):
    title = entry['title']
    if entry.get('x'):
        hits = [b for b in blocks if block_x(b) == str(entry['x'])]
        if not hits:
            raise SystemExit('X:%s not found for %s' % (entry['x'], title))
        titles = [t.lower() for t in block_titles(hits[0])]
        if title.lower() not in titles:
            raise SystemExit('X:%s is %r, expected %r' % (entry['x'], block_titles(hits[0]), title))
        return hits
    hits = [b for b in blocks if block_titles(b) and block_titles(b)[0].lower() == title.lower()]
    if not hits:
        raise SystemExit('No record titled %r' % title)
    if len(hits) > 1 and not entry.get('allMatches'):
        xs = ', '.join('X%s' % block_x(b) for b in hits)
        raise SystemExit('%r matches %s; set "x" or "allMatches" in the manifest' % (title, xs))
    return hits


def retag_block(block, tag, now_ms):
    lines = block.splitlines()
    tags = block_tags(block)
    if tag not in tags:
        tags.append(tag)
    tag_line = '% abcbook-tags ' + ','.join(tags)
    stamp_line = '% abcbook-lastupdated ' + str(now_ms)
    has_tags = any(l.startswith('% abcbook-tags') for l in lines)
    has_stamp = any(l.startswith('% abcbook-lastupdated') for l in lines)
    out = []
    for line in lines:
        if line.startswith('% abcbook-tags'):
            out.append(tag_line)
        elif line.startswith('% abcbook-lastupdated'):
            out.append(stamp_line)
        else:
            out.append(line)
    if not has_tags:
        out.append(tag_line)
    if not has_stamp:
        out.append(stamp_line)
    return '\n'.join(out)


def tune_id_for(title):
    return hashlib.sha1(('andrew-kordas:' + title).encode('utf-8')).hexdigest()[:24]


def read_abc_file(path):
    src_url = ''
    headers = []
    body = []
    in_body = False
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.rstrip()
        if line.startswith('% src-url '):
            src_url = line[len('% src-url '):].strip()
            continue
        if in_body:
            body.append(line)
            continue
        if line.startswith('K:'):
            headers.append(line)
            in_body = True
        elif HEADER_RE.match(line):
            if line[0] in 'XCB':
                raise SystemExit('%s: X:, C: and B: come from the manifest' % path)
            headers.append(line)
        elif line.startswith('%%'):
            headers.append(line)
        elif line.strip():
            raise SystemExit('%s: unexpected line before K: %r' % (path, line))
    if not in_body:
        raise SystemExit('%s: missing K: line' % path)
    while body and not body[-1].strip():
        body.pop()
    if not body:
        raise SystemExit('%s: no notes after K:' % path)
    voices = {m.group(1) for m in (VOICE_RE.match(l) for l in body) if m}
    if len(voices) > MAX_VOICES:
        raise SystemExit('%s: %d voices, limit is %d' % (path, len(voices), MAX_VOICES))
    return src_url, headers, body


def new_tune_block(x_number, tune, tag, now_ms):
    lines = ['X: %d' % x_number, 'T: ' + tune['title']]
    book_lines = ['B: ' + book for book in tune.get('books', [])]
    src_url = ''
    if tune.get('abcFile'):
        src_url, headers, body = read_abc_file(HERE / tune['abcFile'])
        alt_titles = [h for h in headers if h.startswith('T:')]
        lines.extend(alt_titles)
        lines.append('C: ' + tune['composer'])
        lines.extend(book_lines)
        if tune.get('notes'):
            lines.append('N:' + tune['notes'])
        lines.extend(h for h in headers if not h.startswith('T:'))
        lines.extend(body)
    else:
        lines.append('C: ' + tune['composer'])
        lines.extend(book_lines)
        if tune.get('meter'):
            lines.append('M:' + tune['meter'])
        if tune.get('rhythm'):
            lines.append('R: ' + tune['rhythm'])
        if tune.get('notes'):
            lines.append('N:' + tune['notes'])
        if tune.get('key'):
            lines.append('K:' + tune['key'])
    lines.extend([
        '% abcbook-tune_id ' + tune_id_for(tune['title']),
        '% abcbook-link-0 ' + tune['youtube'],
        '% abcbook-link-title-0 ' + tune['linkTitle'],
        '% abcbook-auto-enrich pending',
        '% abcbook-tags ' + ','.join([tag] + tune.get('extraTags', [])),
        '% abcbook-lastupdated ' + str(now_ms),
        '% abcbook-src-url ' + src_url,
    ])
    return '\n'.join(lines), bool(tune.get('abcFile'))


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--export', required=True, help='tunebook ABC export')
    parser.add_argument('--manifest', default=str(HERE / 'manifest.json'))
    parser.add_argument('--out', default=str(HERE / 'output'))
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding='utf-8'))
    tag = manifest['tag']
    blocks = split_blocks(Path(args.export).expanduser().read_text(encoding='utf-8'))
    now_ms = int(time.time() * 1000)

    for title in manifest.get('alreadyTagged', []):
        hits = [b for b in blocks if title.lower() in [t.lower() for t in block_titles(b)]]
        if not any(tag in block_tags(b) for b in hits):
            raise SystemExit('%r is listed as already tagged but is not' % title)

    tagged_before = {block_x(b) for b in blocks if tag in block_tags(b)}

    updates = []
    resolved = []
    seen = set()
    for entry in manifest['tagUpdates']:
        for block in resolve_targets(blocks, entry):
            x = block_x(block)
            if x in seen:
                continue
            seen.add(x)
            resolved.append((entry['title'], x, x in tagged_before))
            updates.append(retag_block(block, tag, now_ms))

    existing_ids = set(re.findall(r'% abcbook-tune_id (\S+)', '\n'.join(blocks)))
    max_x = max(int(block_x(b)) for b in blocks)
    new_blocks = []
    with_notation = []
    without_notation = []
    for i, tune in enumerate(manifest['newTunes']):
        tid = tune_id_for(tune['title'])
        if tid in existing_ids:
            raise SystemExit('Generated id for %r already exists in the export' % tune['title'])
        block, has_abc = new_tune_block(max_x + 1 + i, tune, tag, now_ms)
        new_blocks.append(block)
        (with_notation if has_abc else without_notation).append(tune['title'])

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'kordas-tag-updates.abc').write_text('\n\n'.join(updates) + '\n', encoding='utf-8')
    (out_dir / 'kordas-new-tunes.abc').write_text('\n\n'.join(new_blocks) + '\n', encoding='utf-8')

    newly_tagged = sum(1 for _, _, was in resolved if not was)
    print('Export: %d tunes, %d already tagged %r' % (len(blocks), len(tagged_before), tag))
    print('Tag updates: %d records (%d newly tagged)' % (len(updates), newly_tagged))
    for title, x, was in resolved:
        print('  X%-5s %s%s' % (x, title, '  (already tagged)' if was else ''))
    print('New tunes: %d (%d with notation)' % (len(new_blocks), len(with_notation)))
    print('  with notation: ' + ', '.join(with_notation))
    print('  link only:     ' + ', '.join(without_notation))
    print('Expected %r count after import: %d' % (tag, len(tagged_before) + newly_tagged + len(new_blocks)))
    publish = {}
    for block in updates + new_blocks:
        for line in block.splitlines():
            if line.startswith('B:'):
                book = line[2:].strip().lower()
                publish[book] = publish.get(book, 0) + 1
    print('Books to publish: ' + ', '.join(
        '%s (%d)' % (b, n) for b, n in sorted(publish.items(), key=lambda kv: -kv[1])))
    print('Wrote %s' % out_dir)
    return 0


if __name__ == '__main__':
    sys.exit(main())

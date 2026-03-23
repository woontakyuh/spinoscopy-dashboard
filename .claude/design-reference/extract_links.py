from pypdf import PdfReader
import re

reader = PdfReader("/Users/TakMD/workspace/spinoscopy-dashboard/.claude/design-reference/주짓수교본.pdf")
links = []
for i, page in enumerate(reader.pages):
    if '/Annots' in page:
        for annot in page['/Annots']:
            obj = annot.get_object()
            if '/A' in obj and '/URI' in obj['/A']:
                uri = obj['/A']['/URI']
                if 'youtu' in uri:
                    links.append(f'{i+1}\t{uri}')

# 텍스트에서도 추출 시도
for i, page in enumerate(reader.pages):
    text = page.extract_text() or ''
    found = re.findall(r'https?://(?:www\.)?(?:youtube\.com|youtu\.be)[^\s\)\"\']+', text)
    for url in found:
        entry = f'{i+1}\t{url}'
        if entry not in links:
            links.append(entry)

outpath = "/Users/TakMD/workspace/spinoscopy-dashboard/.claude/design-reference/교본_유튜브링크.txt"
with open(outpath, 'w') as f:
    f.write('\n'.join(links))
print(f'{len(links)}개 링크 추출 완료 → {outpath}')

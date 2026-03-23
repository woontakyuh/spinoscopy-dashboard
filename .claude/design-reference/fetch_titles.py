import urllib.request
import json
import re
import time

links_path = "/Users/TakMD/workspace/spinoscopy-dashboard/.claude/design-reference/교본_유튜브링크.txt"
output_path = "/Users/TakMD/workspace/spinoscopy-dashboard/.claude/design-reference/교본_링크_제목매핑.txt"

with open(links_path, 'r') as f:
    lines = f.readlines()

results = []
for i, line in enumerate(lines):
    parts = line.strip().split('\t')
    if len(parts) < 2:
        continue
    url = parts[1]
    
    # Extract video ID
    vid = url.split('/')[-1].split('?')[0]
    
    # Use oEmbed API to get title (no API key needed)
    try:
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json"
        req = urllib.request.Request(oembed_url, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read().decode())
        title = data.get('title', 'UNKNOWN')
    except Exception as e:
        title = f"ERROR: {e}"
    
    result = f"{i+1}\t{url}\t{title}"
    results.append(result)
    print(result)
    time.sleep(0.3)  # rate limit

with open(output_path, 'w') as f:
    f.write('\n'.join(results))

print(f"\n완료! {len(results)}개 → {output_path}")

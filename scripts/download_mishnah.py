"""Download all 63 primary Hebrew Mishnah tractates from Sefaria's public export."""
import concurrent.futures, datetime, html, json, pathlib, re, urllib.request, time
ROOT = pathlib.Path(__file__).resolve().parents[1]
INDEX = 'https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/books.json'
def get(url):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as response: return json.load(response)
        except Exception:
            if attempt == 3: raise
            time.sleep(attempt + 1)
def clean(text):
    text = re.sub(r'<sup\b[^>]*>.*?</sup>|<i\b[^>]*class=["\']footnote["\'][^>]*>.*?</i>', '', text, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', text))).strip()
def fetch(book):
    raw = get(book['json_url'])
    path = ROOT / 'public/data/raw' / (book['title'].replace(' ', '_') + '.json')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw, ensure_ascii=False), encoding='utf-8')
    chapters = [[clean(s) for s in chapter] for chapter in raw['text']]
    assert all(chapters) and all(s for chapter in chapters for s in chapter), book['title']
    return dict(sourceTitle=book['title'], title=book['title'].removeprefix('Mishnah '), heTitle=raw['heTitle'].removeprefix('משנה '), order=book['categories'][1].removeprefix('Seder '), chapters=chapters, source=book['json_url'], versions=raw.get('versions', [[raw.get('versionTitle'), raw.get('versionSource')]]))
def main():
    index=get(INDEX)
    books=[b for b in index['books'] if len(b['categories']) == 2 and b['categories'][0]=='Mishnah' and b['categories'][1].startswith('Seder ') and b['language']=='Hebrew' and b['versionTitle']=='merged']
    assert len(books)==63, f'Expected 63 tractates, found {len(books)}'
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: tractates=list(pool.map(fetch, books))
    orders=['Zeraim','Moed','Nashim','Nezikin','Kodashim','Tahorot']
    tractates.sort(key=lambda b:(orders.index(b['order']), b['title']))
    corpus=dict(downloadedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(), sourceIndex=INDEX, exportDate=index['generated_at'], description='Complete primary Hebrew Mishnah export, including the additional chapters present in the source edition (e.g. Avot 6). No commentary collections.', tractates=tractates)
    (ROOT/'public/data/mishnah.json').write_text(json.dumps(corpus,ensure_ascii=False),encoding='utf-8')
    (ROOT/'public/data/mishnah.txt').write_text('\n\n'.join(f"Mishnah {b['title']} {c+1}:{m+1}\n{s}" for b in tractates for c,ch in enumerate(b['chapters']) for m,s in enumerate(ch)),encoding='utf-8')
    print(f"Downloaded {len(tractates)} tractates, {sum(len(b['chapters']) for b in tractates)} chapters, {sum(len(ch) for b in tractates for ch in b['chapters'])} passages.")
if __name__=='__main__': main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IRIS 뉴스 자동 수집기
GitHub Actions에서 하루 1회 실행되어 news.json 을 갱신한다.
표준 라이브러리만 사용 (추가 설치 불필요).
"""
import urllib.request, urllib.error, re, json, html, datetime, sys

UA = {'User-Agent': 'Mozilla/5.0 (compatible; IRIS-monitor/1.0)'}
TIMEOUT = 20

# 카테고리별 수집 대상 (Google News RSS 검색 + 매체 피드)
FEEDS = [
    ("관세·통관", "https://news.google.com/rss/search?q=Iraq+customs+tariff+OR+ASYCUDA&hl=en-US&gl=US&ceid=US:en"),
    ("관세·통관", "https://news.google.com/rss/search?q=%D8%A7%D9%84%D9%83%D9%85%D8%A7%D8%B1%D9%83+%D8%A7%D9%84%D8%B9%D8%B1%D8%A7%D9%82%D9%8A%D8%A9&hl=ar&gl=IQ&ceid=IQ:ar"),
    ("항만·물류", "https://news.google.com/rss/search?q=%22Umm+Qasr%22+OR+%22Iraq+port%22&hl=en-US&gl=US&ceid=US:en"),
    ("항만·물류", "https://news.google.com/rss/search?q=%22Strait+of+Hormuz%22+shipping&hl=en-US&gl=US&ceid=US:en"),
    ("경제·환율", "https://news.google.com/rss/search?q=Iraq+dinar+exchange+rate+OR+Central+Bank+of+Iraq&hl=en-US&gl=US&ceid=US:en"),
    ("투자·면세", "https://news.google.com/rss/search?q=Iraq+investment+license+OR+customs+exemption&hl=en-US&gl=US&ceid=US:en"),
    ("종합", "https://www.iraq-businessnews.com/feed/"),
    ("종합", "https://news.google.com/rss/search?q=%EC%9D%B4%EB%9D%BC%ED%81%AC+%EA%B4%80%EC%84%B8+OR+%EC%9D%B4%EB%9D%BC%ED%81%AC+%ED%86%B5%EA%B4%80&hl=ko&gl=KR&ceid=KR:ko"),
]

# 노이즈 제거 키워드 (제목에 있으면 버림)
DROP = re.compile(r'\b(dinar\s+revalu|RV\b|guru|forecast\s+2030|horoscope|betting)', re.I)


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        raw = r.read()
    return raw.decode('utf-8', 'replace')


def clean(s):
    if not s:
        return ''
    s = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', s, flags=re.S)
    s = re.sub(r'<[^>]+>', '', s)
    return html.unescape(s).replace('\xa0', ' ').strip()


def parse_date(s):
    """RSS pubDate → ISO 날짜 (실패 시 빈 문자열)"""
    s = (s or '').strip()
    for fmt in ('%a, %d %b %Y %H:%M:%S %z', '%a, %d %b %Y %H:%M:%S %Z',
                '%a, %d %b %Y %H:%M:%S', '%Y-%m-%dT%H:%M:%S%z'):
        try:
            return datetime.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    m = re.search(r'(\d{1,2})\s+(\w{3})\s+(\d{4})', s)
    if m:
        try:
            return datetime.datetime.strptime(f'{m.group(1)} {m.group(2)} {m.group(3)}',
                                              '%d %b %Y').date().isoformat()
        except ValueError:
            pass
    return ''


def parse_feed(xml, cat):
    out = []
    items = re.findall(r'<item[^>]*>(.*?)</item>', xml, re.S)
    if not items:  # Atom
        items = re.findall(r'<entry[^>]*>(.*?)</entry>', xml, re.S)
    for it in items:
        t = re.search(r'<title[^>]*>(.*?)</title>', it, re.S)
        title = clean(t.group(1) if t else '')
        if not title or DROP.search(title):
            continue
        l = re.search(r'<link[^>]*>(.*?)</link>', it, re.S)
        link = clean(l.group(1) if l else '')
        if not link:
            l2 = re.search(r'<link[^>]*href="([^"]+)"', it)
            link = l2.group(1) if l2 else ''
        if not link.startswith('http'):
            continue
        d = re.search(r'<(?:pubDate|published|updated)[^>]*>(.*?)</(?:pubDate|published|updated)>', it, re.S)
        date = parse_date(clean(d.group(1) if d else ''))
        src = re.search(r'<source[^>]*>(.*?)</source>', it, re.S)
        source = clean(src.group(1) if src else '')
        if not source:
            m = re.match(r'https?://(?:www\.)?([^/]+)', link)
            source = m.group(1) if m else ''
        # Google News 제목은 'headline - Source' 형태 → 매체명 분리
        parts = title.rsplit(' - ', 1)
        if len(parts) == 2 and 2 < len(parts[1]) < 40:
            tail = parts[1].strip()
            # source가 비어 있거나 도메인/구글이면 꼬리를 매체명으로 사용
            if not source or source.startswith('news.google') or '.' in source:
                title, source = parts[0].strip(), tail
            # source와 꼬리가 같은 매체면 제목에서만 제거
            elif tail.lower().replace(' ', '') in source.lower().replace(' ', '') \
                 or source.lower().replace(' ', '') in tail.lower().replace(' ', ''):
                title = parts[0].strip()
        out.append({'cat': cat, 'title': title[:180], 'url': link,
                    'date': date, 'source': source[:40]})
    return out


def main():
    all_items, errors = [], []
    for cat, url in FEEDS:
        try:
            all_items += parse_feed(fetch(url), cat)
        except Exception as e:
            errors.append(f'{cat}: {type(e).__name__}')

    # 중복 제거 (제목 앞 60자 기준)
    seen, uniq = set(), []
    for it in all_items:
        k = re.sub(r'\W+', '', it['title'].lower())[:60]
        if k in seen:
            continue
        seen.add(k)
        uniq.append(it)

    # 최근 30일 이내만, 날짜 내림차순
    today = datetime.date.today()
    def keep(it):
        if not it['date']:
            return True
        try:
            return (today - datetime.date.fromisoformat(it['date'])).days <= 30
        except ValueError:
            return True
    uniq = [i for i in uniq if keep(i)]
    uniq.sort(key=lambda x: x['date'] or '0000-00-00', reverse=True)

    data = {
        'updated': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
        'count': len(uniq[:120]),
        'errors': errors,
        'items': uniq[:120],
    }
    with open('news.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f'수집 {len(uniq)}건 (저장 {data["count"]}건) / 오류 {errors or "없음"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

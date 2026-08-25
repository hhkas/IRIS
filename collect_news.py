#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IRIS 뉴스 자동 수집기 (v2 — 한글 번역 포함)
GitHub Actions에서 하루 1회 실행되어 news.json 을 갱신한다.
표준 라이브러리만 사용 (추가 설치 불필요).

v2 변경점
  - 피드 8개 → 13개 (자재·건설, 정세·보안, 에너지·전력 카테고리 추가)
  - MyMemory 무료 API로 제목 한글 번역 → items[].title_ko 필드 추가
  - 이전 news.json 의 번역 결과를 캐시로 재사용 (매일 새 기사만 번역)
  - 일일 문자 쿼터 초과 시 원문 유지하고 정상 종료 (스크립트 중단 없음)
"""
import urllib.request, urllib.parse, urllib.error
import re, json, html, datetime, sys, os, time

UA = {'User-Agent': 'Mozilla/5.0 (compatible; IRIS-monitor/2.0)'}
TIMEOUT = 20

# ── 번역 설정 ────────────────────────────────────────────────
# MyMemory 무료 쿼터: 익명 약 5,000자/일, 이메일(de=) 등록 시 약 50,000자/일.
# GitHub Actions는 공용 IP를 쓰므로 익명이면 쿼터가 금방 소진된다.
# 저장소 Settings → Secrets → Actions 에 MYMEMORY_EMAIL 을 등록하고
# 워크플로에서 env로 넘기면 한도가 10배로 늘어난다.
MM_EMAIL      = os.environ.get('MYMEMORY_EMAIL', '').strip()
TRANSLATE     = os.environ.get('IRIS_TRANSLATE', '1') != '0'
CHAR_BUDGET   = 45000 if MM_EMAIL else 4500   # 하루 사용할 문자 수 상한 (여유분 확보)
MM_DELAY      = 0.4                            # 호출 간격 (초)
MM_URL        = 'https://api.mymemory.translated.net/get'

# 카테고리별 수집 대상 (Google News RSS 검색 + 매체 피드)
FEEDS = [
    # 관세·통관
    ("관세·통관", "https://news.google.com/rss/search?q=Iraq+customs+tariff+OR+ASYCUDA&hl=en-US&gl=US&ceid=US:en"),
    ("관세·통관", "https://news.google.com/rss/search?q=%D8%A7%D9%84%D9%83%D9%85%D8%A7%D8%B1%D9%83+%D8%A7%D9%84%D8%B9%D8%B1%D8%A7%D9%82%D9%8A%D8%A9&hl=ar&gl=IQ&ceid=IQ:ar"),
    # 항만·물류
    ("항만·물류", "https://news.google.com/rss/search?q=%22Umm+Qasr%22+OR+%22Iraq+port%22&hl=en-US&gl=US&ceid=US:en"),
    ("항만·물류", "https://news.google.com/rss/search?q=%22Strait+of+Hormuz%22+shipping&hl=en-US&gl=US&ceid=US:en"),
    ("항만·물류", "https://news.google.com/rss/search?q=Iraq+trucking+OR+border+crossing+trade&hl=en-US&gl=US&ceid=US:en"),
    # 경제·환율
    ("경제·환율", "https://news.google.com/rss/search?q=Iraq+dinar+exchange+rate+OR+Central+Bank+of+Iraq&hl=en-US&gl=US&ceid=US:en"),
    # 투자·면세
    ("투자·면세", "https://news.google.com/rss/search?q=Iraq+investment+license+OR+customs+exemption&hl=en-US&gl=US&ceid=US:en"),
    # 자재·건설
    ("자재·건설", "https://news.google.com/rss/search?q=Iraq+cement+OR+steel+rebar+price&hl=en-US&gl=US&ceid=US:en"),
    ("자재·건설", "https://news.google.com/rss/search?q=Iraq+construction+project+OR+housing+contract&hl=en-US&gl=US&ceid=US:en"),
    # 에너지·전력
    ("에너지·전력", "https://news.google.com/rss/search?q=Iraq+electricity+OR+power+grid+OR+gas+import&hl=en-US&gl=US&ceid=US:en"),
    # 정세·보안
    ("정세·보안", "https://news.google.com/rss/search?q=Iraq+security+OR+militia+OR+sanctions&hl=en-US&gl=US&ceid=US:en"),
    # 종합
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


# ── 번역 ─────────────────────────────────────────────────────
RE_KO = re.compile(r'[\uac00-\ud7a3]')
RE_AR = re.compile(r'[\u0600-\u06ff]')
QUOTA_MSG = re.compile(r'MYMEMORY WARNING|QUOTA|ALL AVAILABLE FREE', re.I)


def src_lang(text):
    """제목의 문자 종류로 원문 언어 판별. 한글이면 None (번역 불필요)."""
    if RE_KO.search(text):
        return None
    if RE_AR.search(text):
        return 'ar'
    return 'en'


def load_cache(path='news.json'):
    """이전 news.json 에서 제목→한글 매핑을 회수한다 (같은 기사 재번역 방지)."""
    cache = {}
    try:
        with open(path, encoding='utf-8') as f:
            old = json.load(f)
        for it in old.get('items', []):
            ko = (it.get('title_ko') or '').strip()
            if ko and ko != it.get('title'):
                cache[it['title']] = ko
    except Exception:
        pass
    return cache


def mm_translate(text, lang):
    """MyMemory 1건 호출. 성공 시 번역문, 쿼터 소진 시 None, 그 외 실패 시 ''."""
    q = {'q': text, 'langpair': f'{lang}|ko'}
    if MM_EMAIL:
        q['de'] = MM_EMAIL
    url = MM_URL + '?' + urllib.parse.urlencode(q)
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            res = json.loads(r.read().decode('utf-8', 'replace'))
    except Exception:
        return ''
    out = (res.get('responseData') or {}).get('translatedText') or ''
    out = html.unescape(out).strip()
    if not out or QUOTA_MSG.search(out):
        return None            # 쿼터 소진 → 이후 번역 중단
    if str(res.get('responseStatus')) not in ('200', '0'):
        return ''
    return out


def translate_all(items):
    """items 에 title_ko 를 채운다. 반환: (신규 번역 건수, 사용 문자 수, 중단 사유)"""
    cache = load_cache()
    used, done, stopped = 0, 0, ''
    for it in items:
        title = it['title']
        # 1) 캐시 우선
        if title in cache:
            it['title_ko'] = cache[title]
            continue
        # 2) 한글 원문이면 그대로
        lang = src_lang(title)
        if lang is None:
            it['title_ko'] = title
            continue
        # 3) 예산·중단 확인
        if not TRANSLATE or stopped or used + len(title) > CHAR_BUDGET:
            it['title_ko'] = title
            if not stopped and TRANSLATE:
                stopped = 'budget'
            continue
        # 4) 호출
        ko = mm_translate(title, lang)
        used += len(title)
        time.sleep(MM_DELAY)
        if ko is None:
            stopped = 'quota'
            it['title_ko'] = title
        elif ko:
            it['title_ko'] = ko
            cache[title] = ko
            done += 1
        else:
            it['title_ko'] = title
    return done, used, stopped


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
    uniq = uniq[:120]

    # 한글 번역 (실패해도 수집 결과는 반드시 저장)
    try:
        tdone, tused, tstop = translate_all(uniq)
    except Exception as e:
        tdone, tused, tstop = 0, 0, type(e).__name__
        for it in uniq:
            it.setdefault('title_ko', it['title'])

    data = {
        'updated': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'),
        'count': len(uniq),
        'errors': errors,
        'translated': {'new': tdone, 'chars': tused, 'stopped': tstop,
                       'mode': 'email' if MM_EMAIL else 'anonymous'},
        'items': uniq,
    }
    with open('news.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f'수집 {len(uniq)}건 / 번역 신규 {tdone}건 ({tused}자, {data["translated"]["mode"]})'
          f'{" — 중단:" + tstop if tstop else ""} / 오류 {errors or "없음"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())



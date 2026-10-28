"""
구매내역 xls → 암호화된 data.enc 생성

사용법:
    pip install pandas xlrd cryptography
    python tools/build_data.py --src <xls 폴더> --password <비밀번호> [--out data.enc]

- 회사 시스템 "구매내역(자재 기준)" 엑셀(연도별 파일)을 폴더에 모아 두고 실행합니다.
- 소계 행은 자동으로 제외합니다.
- 결과 파일(data.enc)은 AES-256-GCM 으로 암호화되며, 키는 비밀번호에서 PBKDF2-SHA256(250,000회)으로 만듭니다.
- 비밀번호를 바꾸려면 새 비밀번호로 다시 실행하고 data.enc 를 교체하면 됩니다.
"""
import argparse, base64, glob, json, os, sys

import pandas as pd
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ITER = 250_000
COLS = ['현장명', '거래처명', '품명', '자재 코드', '규격', '단위', 'PR번호', '통화']


def load(src):
    files = sorted(glob.glob(os.path.join(src, '*.xls')) + glob.glob(os.path.join(src, '*.xlsx')))
    if not files:
        sys.exit(f'엑셀 파일이 없습니다: {src}')
    frames = []
    for f in files:
        df = pd.read_excel(f, engine='xlrd' if f.endswith('.xls') else None)
        if '순번' not in df.columns:
            print(f'건너뜀 (형식 다름): {f}')
            continue
        frames.append(df)
    d = pd.concat(frames)
    d = d[pd.to_numeric(d['순번'], errors='coerce').notna()].copy()  # 소계 행 제외
    d['date'] = pd.to_datetime(d['발주일자'])
    for c in ['발주수량', '발주단가', '발주금액(USD)', '입고수량']:
        d[c] = pd.to_numeric(d[c], errors='coerce').fillna(0)
    for c in COLS:
        d[c] = d[c].fillna('').astype(str).str.strip()
    d['단위'] = d['단위'].str.upper()
    d['PR번호'] = d['PR번호'].str.replace(r'\.0$', '', regex=True)
    return d.sort_values('date').reset_index(drop=True)


def encode(d):
    def enc(col):
        vals = sorted(d[col].unique())
        idx = {v: i for i, v in enumerate(vals)}
        return vals, d[col].map(idx).tolist()
    S, si = enc('현장명'); V, vi = enc('거래처명'); N, ni = enc('품명')
    C, ci = enc('자재 코드'); P, pi = enc('규격'); U, ui = enc('단위')
    rows = []
    for k, rec in enumerate(d.to_dict('records')):
        rows.append([int(rec['date'].strftime('%Y%m%d')), si[k], vi[k], ni[k], ci[k], pi[k], ui[k],
                     1 if rec['통화'] == 'IQD' else 0,
                     round(float(rec['발주수량']), 3), round(float(rec['발주단가']), 4),
                     round(float(rec['발주금액(USD)']), 2), round(float(rec['입고수량']), 3), rec['PR번호']])
    return {'S': S, 'V': V, 'N': N, 'C': C, 'P': P, 'U': U, 'R': rows,
            'gen': pd.Timestamp.now().strftime('%Y-%m-%d')}


def encrypt(obj, password):
    salt, iv = os.urandom(16), os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(password.encode())
    ct = AESGCM(key).encrypt(iv, json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode(), None)
    b = lambda x: base64.b64encode(x).decode()
    return json.dumps({'v': 1, 'iter': ITER, 'salt': b(salt), 'iv': b(iv), 'ct': b(ct)})


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--password', required=True)
    ap.add_argument('--out', default='data.enc')
    a = ap.parse_args()
    d = load(a.src)
    obj = encode(d)
    open(a.out, 'w').write(encrypt(obj, a.password))
    print(f'{len(obj["R"]):,}건 · {d.date.min():%Y-%m-%d} ~ {d.date.max():%Y-%m-%d} → {a.out}')

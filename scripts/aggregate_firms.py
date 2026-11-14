"""Gộp zip FIRMS 'all countries' thành số đếm theo tháng x ô lưới x vệ tinh x quốc gia (toàn cầu).

Dùng:  python -I scripts/aggregate_firms.py <thư_mục_zips> <thư_mục_ra> [--cell 0.25] [--workers 4]
Mỗi zip -> 1 file <ra>/<tên_zip>.csv.gz (chạy lại sẽ bỏ qua file đã xong, nên dừng/tiếp tục được).
Cột ra: country,sat,ym,ci,cj,n,hi,frp,night   (lat tâm ô = (ci+0.5)*cell, lon tâm = (cj+0.5)*cell)
"""
import argparse, glob, os, sys, zipfile
import numpy as np, pandas as pd
from multiprocessing import Pool

SAT = {'Terra': 'terra', 'Aqua': 'aqua', 'N': 'snpp', 'N20': 'n20', 'N21': 'n21'}
COLS = ['latitude', 'longitude', 'acq_date', 'satellite', 'confidence', 'frp', 'daynight']

def work(a):
    path, outdir, cell = a
    out = os.path.join(outdir, os.path.basename(path)[:-4] + '.csv.gz')
    if os.path.exists(out):
        return out
    parts = []
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if not name.endswith('.csv'):
                continue
            country = os.path.basename(name)[:-4].split('_', 2)[2]   # modis_2019_Viet Nam -> Viet Nam
            for ch in pd.read_csv(z.open(name), usecols=COLS, dtype={'confidence': str, 'satellite': str}, chunksize=500_000):
                c = pd.to_numeric(ch.confidence, errors='coerce')   # MODIS 0-100; VIIRS l/n/h
                ch['hi'] = np.where(c.notna(), c >= 30, ch.confidence.isin(['n', 'h']))
                ch['sat'] = ch.satellite.map(SAT).fillna(ch.satellite)
                ch['ym'] = ch.acq_date.str[:7]
                ch['ci'] = np.floor(ch.latitude / cell).astype(np.int32)
                ch['cj'] = np.floor(ch.longitude / cell).astype(np.int32)
                ch['night'] = ch.daynight == 'N'
                ch['country'] = country
                parts.append(ch.groupby(['country', 'sat', 'ym', 'ci', 'cj']).agg(
                    n=('frp', 'size'), hi=('hi', 'sum'), frp=('frp', 'sum'), night=('night', 'sum')).reset_index())
    if not parts:
        return None
    df = pd.concat(parts).groupby(['country', 'sat', 'ym', 'ci', 'cj'], as_index=False).sum()
    df.to_csv(out + '.tmp', index=False, compression='gzip'); os.replace(out + '.tmp', out)
    return out

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('zips'); p.add_argument('out')
    p.add_argument('--cell', type=float, default=0.25); p.add_argument('--workers', type=int, default=4)
    a = p.parse_args(); os.makedirs(a.out, exist_ok=True)
    files = sorted(glob.glob(os.path.join(a.zips, '**', '*.zip'), recursive=True))
    with Pool(a.workers) as pool:
        for r in pool.imap_unordered(work, [(f, a.out, a.cell) for f in files]):
            print('done', r, flush=True)

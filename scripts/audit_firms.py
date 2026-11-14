"""Kiểm toán chất lượng toàn bộ zip FIRMS (toàn cầu, mọi nước). Không lọc vùng.

Dùng: python -I scripts/audit_firms.py <thư_mục_zips> <thư_mục_ra> [--workers 3]
Mỗi zip -> <ra>/<tên_zip>.pkl (dict các DataFrame nhỏ). Chạy lại sẽ bỏ qua zip đã xong.
Bảng ra: daily, cm (country x ym x type), version, scan, conf, qc (đếm lỗi), dup.
"""
import argparse, glob, os, pickle, re, zipfile
import numpy as np, pandas as pd
from multiprocessing import Pool

SCAN_BINS = [0, 0.5, 0.8, 1.5, 2.5, 3.5, 99]


def audit(args):
    path, outdir = args
    out = os.path.join(outdir, os.path.basename(path)[:-4] + '.pkl')
    if os.path.exists(out):
        return out
    z = zipfile.ZipFile(path)
    yr = re.search(r'_(\d{4})_', path).group(1)
    daily, cm, ver, scan, conf, qc, keys, dups_in = [], [], [], [], [], [], [], 0
    for name in z.namelist():
        if not name.endswith('.csv'):
            continue
        country = os.path.basename(name)[:-4].split('_', 2)[2]
        d = pd.read_csv(z.open(name), dtype={'confidence': str, 'version': str, 'acq_time': str, 'satellite': str})
        if d.empty:
            continue
        t = d.acq_time.astype(int)
        hh = t // 100 + (t % 100) / 60.0
        d['ltm'] = (hh + d.longitude / 15.0) % 24
        d['ym'] = d.acq_date.str[:7]
        d['frp_ok'] = d.frp.where(d.frp > 0, 0.0)
        cn = pd.to_numeric(d.confidence, errors='coerce')
        d['hi'] = np.where(cn.notna(), cn >= 30, d.confidence.isin(['n', 'h']))
        d['day'] = d.daynight == 'D'
        d['ltd'] = d['ltm'].where(d['day'], 0.0)
        d['t0'] = d.type == 0
        d['edge'] = d.scan > 2.5
        g = d.groupby(['satellite', 'acq_date']).agg(
            n=('frp', 'size'), t0=('t0', 'sum'), hi=('hi', 'sum'), frp=('frp_ok', 'sum'),
            nday=('day', 'sum'), lt_sum=('ltd', 'sum'), edge=('edge', 'sum')).reset_index()
        daily.append(g)
        c = d.groupby(['satellite', 'ym', 'type']).agg(n=('frp', 'size'), hi=('hi', 'sum'), frp=('frp_ok', 'sum')).reset_index()
        c['country'] = country
        cm.append(c)
        ver.append(d.groupby(['satellite', 'ym', 'version']).size().rename('n').reset_index())
        d['sb'] = np.digitize(d.scan, SCAN_BINS) - 1
        scan.append(d.groupby(['satellite', 'sb']).size().rename('n').reset_index())
        conf.append(d.groupby(['satellite', 'confidence']).size().rename('n').reset_index())
        qc.append(pd.DataFrame([{
            'country': country, 'rows': len(d), 'nan': int(d.isna().sum().sum() - 0),
            'frp_le0': int((d.frp <= 0).sum()), 'frp_nan': int(d.frp.isna().sum()),
            'bad_year': int((d.acq_date.str[:4] != yr).sum()),
            'bad_lat': int((d.latitude.abs() > 90).sum()), 'bad_lon': int((d.longitude.abs() > 180).sum()),
            'lon_ge_179_9': int((d.longitude.abs() >= 179.9).sum()),
            'bad_time': int(((t < 0) | (t > 2359) | (t % 100 > 59)).sum()),
        }]))
        k = ((np.round((d.latitude.values + 90) * 1e5).astype(np.int64) * 36000001 + np.round((d.longitude.values + 180) * 1e5).astype(np.int64)).astype(np.uint64)
             * np.uint64(1000003) + (pd.to_datetime(d.acq_date).values.astype('datetime64[D]').astype(np.int64).astype(np.uint64) * np.uint64(1440) + t.values.astype(np.uint64))
             * np.uint64(7919) + pd.factorize(d.satellite)[0].astype(np.uint64) * np.uint64(104729))
        dups_in += len(k) - len(np.unique(k))
        keys.append(k)
    kk = np.concatenate(keys)
    res = {
        'daily': pd.concat(daily).groupby(['satellite', 'acq_date'], as_index=False).sum(),
        'cm': pd.concat(cm), 'version': pd.concat(ver).groupby(['satellite', 'ym', 'version'], as_index=False).sum(),
        'scan': pd.concat(scan).groupby(['satellite', 'sb'], as_index=False).sum(),
        'conf': pd.concat(conf).groupby(['satellite', 'confidence'], as_index=False).sum(),
        'qc': pd.concat(qc),
        'dup': pd.DataFrame([{'zip': os.path.basename(path), 'rows': len(kk), 'dup_within_country': dups_in,
                              'dup_total': len(kk) - len(np.unique(kk))}]),
    }
    with open(out + '.tmp', 'wb') as f:
        pickle.dump(res, f)
    os.replace(out + '.tmp', out)
    return out


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('zips'); p.add_argument('out'); p.add_argument('--workers', type=int, default=3)
    a = p.parse_args()
    os.makedirs(a.out, exist_ok=True)
    files = sorted(glob.glob(os.path.join(a.zips, '**', '*.zip'), recursive=True), key=os.path.getsize, reverse=True)
    with Pool(a.workers) as pool:
        for r in pool.imap_unordered(audit, [(f, a.out) for f in files]):
            print('done', r, flush=True)
    print('ALL DONE', flush=True)

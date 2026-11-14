FROM python:3.12-slim
WORKDIR /srv
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY scripts ./scripts
# Real data is mounted or copied to /srv/data and pointed to by DATA_DIR. For a throwaway demo, bake the sample data in:
#   RUN python scripts/make_sample_data.py --out /srv/data/sample
ENV DATA_DIR=/srv/data/sample
# Render and Cloud Run both inject $PORT.
CMD ["sh", "-c", "uvicorn app.asgi:app --host 0.0.0.0 --port ${PORT:-8000}"]

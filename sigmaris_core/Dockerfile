FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System deps (minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install deps first for layer caching
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy sigmaris_core only (this Dockerfile is built with context = sigmaris_core)
COPY . /app

# Fly sets PORT; default to 8080 for local docker runs.
ENV PORT=8080

CMD ["sh", "-lc", "python -m uvicorn server:app --host 0.0.0.0 --port ${PORT}"]


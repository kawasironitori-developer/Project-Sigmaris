FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System deps (minimal)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install Python deps first for better layer caching
COPY sigmaris_core/requirements.txt /app/sigmaris_core/requirements.txt
RUN pip install --no-cache-dir -r /app/sigmaris_core/requirements.txt

# Copy app source
COPY . /app

# Fly sets PORT; default to 8080 for local docker runs.
ENV PORT=8080

# Important: run from sigmaris_core so `import persona_core` resolves to `sigmaris_core/persona_core`
WORKDIR /app/sigmaris_core

CMD ["sh", "-lc", "python -m uvicorn server:app --host 0.0.0.0 --port ${PORT}"]


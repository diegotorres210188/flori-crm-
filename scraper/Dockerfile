FROM python:3.12-slim

WORKDIR /app

# Dependencias del sistema para Playwright
RUN apt-get update && apt-get install -y \
    wget curl git \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
    libcairo2 libasound2 libx11-xcb1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Instalar browser de Playwright
RUN playwright install chromium --with-deps

COPY . .

CMD ["python3", "worker.py"]

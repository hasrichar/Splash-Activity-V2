FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Buat folder static/music dan static/covers beserta izin tulis penuh untuk upload
RUN mkdir -p static/music static/covers && chmod -R 777 static

# Hugging Face Spaces wajib menggunakan port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "2", "--threads", "4", "--timeout", "120", "app:app"]

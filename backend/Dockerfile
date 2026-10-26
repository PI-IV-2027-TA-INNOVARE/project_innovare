FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/opt/huggingface

WORKDIR /app/backend

# torch so de CPU: sem o indice abaixo o pip no Linux baixa a versao com CUDA (+2 GB).
ARG TORCH_VERSION=2.14.1
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==${TORCH_VERSION}

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

# O modelo de embedding vai dentro da imagem: o matching nao depende do Hugging Face ao rodar.
ARG SEARCH_EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${SEARCH_EMBEDDING_MODEL}')"
ENV HF_HUB_OFFLINE=1

COPY IA /app/IA
COPY backend /app/backend

EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]

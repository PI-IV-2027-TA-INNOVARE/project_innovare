FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/opt/huggingface

# A API nao roda como root: quem explorar uma falha fica com um usuario sem
# privilegio. A pasta do modelo e dele, porque e ele quem baixa o modelo abaixo.
RUN useradd --system --uid 10001 --home-dir /app pdconnect \
    && mkdir -p /opt/huggingface /app/backend/media \
    && chown -R pdconnect:pdconnect /opt/huggingface /app

WORKDIR /app/backend

# torch so de CPU: sem o indice abaixo o pip no Linux baixa a versao com CUDA (+2 GB).
ARG TORCH_VERSION=2.15.0
RUN pip install --index-url https://download.pytorch.org/whl/cpu torch==${TORCH_VERSION}

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

# O modelo de embedding vai dentro da imagem: o matching nao depende do Hugging Face ao rodar.
ARG SEARCH_EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
USER pdconnect
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${SEARCH_EMBEDDING_MODEL}')"
ENV HF_HUB_OFFLINE=1

COPY --chown=pdconnect:pdconnect IA /app/IA
COPY --chown=pdconnect:pdconnect backend /app/backend

# Servidor de producao. No desenvolvimento, o docker-compose.yml troca este
# comando pelo servidor de desenvolvimento, que recarrega o codigo ao salvar.
EXPOSE 8000
CMD ["gunicorn", "--config", "gunicorn.conf.py"]

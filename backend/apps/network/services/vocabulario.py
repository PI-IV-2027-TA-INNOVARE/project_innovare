"""
O vocabulario de competencias: texto livre com uma lista de sinonimos.

Cada `Competencia` com `sinonimo_de` preenchido aponta para o termo canonico.
Antes de virar vetor, o texto troca o sinonimo pelo canonico, e "qPCR" e "PCR
quantitativo" passam a ser o mesmo termo para a afinidade com o tema.
"""
from __future__ import annotations

import re

from apps.network.models import Competencia


class Vocabulario:
    def __init__(self, sinonimos: dict[str, str]) -> None:
        self._sinonimos = {
            sinonimo: canonico
            for sinonimo, canonico in sinonimos.items()
            if sinonimo and canonico and sinonimo.lower() != canonico.lower()
        }

    @classmethod
    def da_rede(cls) -> Vocabulario:
        return cls(
            dict(
                Competencia.objects.filter(sinonimo_de__isnull=False).values_list(
                    'nome', 'sinonimo_de__nome'
                )
            )
        )

    def canonizar(self, texto: str) -> str:
        resultado = texto or ''

        for sinonimo in sorted(self._sinonimos, key=len, reverse=True):
            canonico = self._sinonimos[sinonimo]
            resultado = re.sub(
                rf'(?<!\w){re.escape(sinonimo)}(?!\w)',
                lambda _achado, canonico=canonico: canonico,
                resultado,
                flags=re.IGNORECASE,
            )

        return resultado

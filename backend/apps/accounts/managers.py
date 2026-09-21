"""Manager do `Usuario`."""
from django.contrib.auth.models import BaseUserManager


class UsuarioManager(BaseUserManager):
    """
    Cria contas.

    Nao ha `create_user` exposto por rota publica: quem chama isto e o servico
    de provisionamento do Administrador ou a liberacao de acesso feita pelo
    Supervisor (RN-A04).
    """

    use_in_migrations = True

    def _criar(self, email, nome, papel, password, **extra):
        if not email:
            raise ValueError('A conta precisa de um e-mail.')
        if not papel:
            raise ValueError('A conta precisa de um papel entre os quatro atores.')

        usuario = self.model(
            email=self.normalize_email(email).strip().lower(),
            nome=nome,
            papel=papel,
            **extra,
        )

        if password:
            usuario.set_password(password)
        else:
            usuario.set_unusable_password()

        usuario.save(using=self._db)
        return usuario

    def create_user(self, email, nome='', papel=None, password=None, **extra):
        extra.setdefault('is_staff', False)
        extra.setdefault('is_superuser', False)
        return self._criar(email, nome, papel, password, **extra)

    def create_superuser(self, email, nome='', papel=None, password=None, **extra):
        from apps.accounts.models import Papel, SituacaoConta

        extra.setdefault('is_staff', True)
        extra.setdefault('is_superuser', True)
        extra.setdefault('situacao', SituacaoConta.ATIVO)

        if extra['is_staff'] is not True:
            raise ValueError('Um superusuario precisa de is_staff=True.')
        if extra['is_superuser'] is not True:
            raise ValueError('Um superusuario precisa de is_superuser=True.')

        return self._criar(email, nome, papel or Papel.ADMINISTRADOR, password, **extra)

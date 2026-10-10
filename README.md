# Gastos do Casal

App de celular (PWA) para controlar e dividir gastos a dois, no estilo Splitwise.

- **Projetos** separados, com **tipo** (Casa, Viagem ou Outros — por enquanto só classifica), cada um com a **proporção de divisão** própria em pesos
  livres (1 e 2, 60 e 40…),
  aplicada a todas as despesas do projeto — mudar a proporção recalcula todas, inclusive as antigas.
- **Categorias por projeto** com **descrições sugeridas** (Luz, Água, Feira, Aluguel…). Projeto novo
  começa com uma base padrão de casa ou **copia outro projeto** (pessoas, proporção, categorias e
  sugestões).
- **Lançamento rápido**: valor → categoria → toque numa sugestão → salvar. "Quem pagou" já vem como
  você e a data como hoje. Categoria e descrição são obrigatórias.
- **Saldo** ("Fulana te deve R$ X") e **acerto de contas** (registro do Pix).
- **Moedas estrangeiras** por projeto (até 2 além do real, com cotação). Despesa é lançada na moeda
  original; saldo e acerto são em reais, pela cotação do projeto — corrigir a cotação (ex.: quando
  chega a fatura) recalcula tudo.
- **Resumo do mês**: total, quanto cada um pagou e assumiu, gasto por categoria.
- **Tempo real**: o que um lança aparece no celular do outro.
- **Instalável** com ícone na tela inicial e atalho "Nova despesa" (pressionar o ícone no Android).

Stack: Vite + React 19 + TypeScript + Supabase (Postgres, Auth, Realtime). Sem servidor próprio.

## 1. Criar o banco (Supabase, grátis)

1. Crie um projeto em <https://supabase.com> (região São Paulo).
2. **Authentication → Sign In / Providers**: desligue **Allow new users to sign up** (as contas são
   criadas só por você, no painel) e **Confirm email**.
3. **Authentication → Users → Add user → Create new user**: crie as **duas** contas (e-mail e senha),
   marcando **Auto Confirm User**.
4. **SQL Editor**: rode `supabase/migrations/0001_init.sql`.
5. Ainda no SQL Editor, dê nome às duas pessoas (sem isso aparece o começo do e-mail):

   ```sql
   update profiles set display_name = 'Gustavo' where id = (select id from auth.users where email = 'seu@email.com');
   update profiles set display_name = 'Nome dela' where id = (select id from auth.users where email = 'dela@email.com');
   ```

   > Se rodar o passo 4 antes do 3, sem problema: os perfis são criados quando as contas forem
   > criadas. O que o banco não deixa é criar projeto antes de existirem as duas contas.

6. **Project Settings → API**: copie a `Project URL` e a chave `anon public`.

## 2. Rodar localmente

```bash
cp .env.example .env   # preencha URL e anon key
npm install
npm run dev
npm test               # lógica de divisão, saldos, valores e datas
```

## 3. Publicar (GitHub Pages, grátis)

O workflow `.github/workflows/deploy.yml` roda os testes em todo PR e publica a cada merge na `main`.
Configuração única no GitHub (o repositório precisa ser **público** para o Pages ser grátis — só o
código fica visível; os dados ficam no Supabase, protegidos pelo RLS):

1. **Settings → General → Danger Zone → Change visibility → Public**.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → aba Variables → New repository variable**:
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
4. **Actions → Testes e publicação → Run workflow** (ou faça um merge na `main`).

Endereço: `https://<usuário>.github.io/controle-gastos-gusu/`.

> A chave `anon` é pública por design. Nunca coloque a chave `service_role` no app nem no GitHub.

## 4. Instalar no celular

- **iPhone (Safari)**: abra o link → Compartilhar → **Adicionar à Tela de Início**.
- **Android (Chrome)**: abra o link → menu ⋮ → **Instalar app**.

Depois cada um entra com o e-mail e a senha criados no painel. Todo projeto já nasce com vocês
dois. Ajuste a proporção em **Ajustes do projeto**.

## Como a divisão funciona

- A proporção é **do projeto** (`project_members.weight`), em pesos livres: 1 e 2 dá exatamente um
  terço e dois terços (a tela só mostra "33,3% / 66,7%"). Não há divisão por despesa e nada é
  gravado por despesa: a parte de cada um é calculada na leitura com a proporção atual.
- Por isso **mudar a proporção recalcula todas as despesas e o saldo**, inclusive o que já foi
  acertado. Antes de salvar, o app mostra o saldo antes/depois e pede confirmação.
- Centavos ímpares vão para quem tem o maior resto (nada some, nada sobra) — `src/lib/split.ts`.
- Saldo = pagou − parte que lhe cabe + acertos enviados − acertos recebidos, calculado no banco
  (`project_balances`).

## Banco de dados

```
profiles ─┐
          ├─ project_members (peso na divisão) ── projects (nome, emoji, tipo, moeda padrão)
          │                                           ├─ project_currencies (BRL + até 2, com cotação)
          │                                           │
          │                                           ├─ categories ── category_suggestions
          │                                           │
          ├─ expenses (valor na moeda original, moeda, quem pagou, categoria, data, descrição)
          └─ settlements (acertos: quem pagou a quem)

expense_values (view)   = valor de cada despesa em reais, pela cotação atual
expense_shares (view)   = parte de cada pessoa em cada despesa, pela proporção atual
project_balances (view) = saldo de cada pessoa por projeto
```

## Limitações conhecidas

- Sem lançamento offline: o app abre sem internet, mas salvar precisa de conexão.
- Ícones: `npm run icons` regenera os PNGs a partir do desenho em `scripts/gen-icons.py` (precisa de Pillow).

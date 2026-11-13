# WhatsFamily
Aplicativo privado de mensagens de texto para uma família, feito com React, Vite e Supabase. Interface responsiva em português; acesso por e-mail e senha; histórico das últimas 100 mensagens, atualizado a cada 4 segundos enquanto aberto.

## Configurar o Supabase
1. Crie um projeto em https://supabase.com.
2. Em Authentication / Providers / Email, desative **Allow new users to sign up**. Não habilite cadastro público.
3. Execute `supabase/schema.sql` no SQL Editor (uma vez).
4. Em Authentication / Users, crie cada usuário da família com e-mail e senha, confirmando o e-mail pelo painel. O responsável pode usar endereços sob seu controle. Não use senhas compartilhadas.
5. Copie o UUID de cada usuário e execute, substituindo os exemplos:
   ```sql
   insert into public.members (id, name) values ('UUID-DO-USUARIO', 'Nome');
   ```
   Somente usuários registrados nessa tabela podem ler ou enviar mensagens. Todos os membros desta instalação participam da mesma sala. Para revogar acesso, remova o membro pelo painel (suas mensagens serão removidas em cascata).
6. Em Project Settings / API, obtenha a URL e a chave pública anon (ou publishable). **Nunca use service_role ou chave secreta na interface.**

## Publicar na Vercel
Importe este repositório, selecione Vite, build `npm run build`, saída `dist`. Cadastre:
- `VITE_SUPABASE_URL`: URL do projeto
- `VITE_SUPABASE_ANON_KEY`: chave pública

Faça o deploy. Mudanças nas variáveis exigem novo deploy. Abra a URL HTTPS em cada celular e entre com a respectiva conta. No menu do navegador, use “Adicionar à Tela de Início” (no iPhone, pelo menu Compartilhar do Safari).

## Desenvolvimento
Node.js 24; `npm ci --cache /tmp/npm-cache`. Copie `.env.example` para `.env.local`, preencha as duas variáveis e rode `npm run dev`. Valide produção com `npm run build` e `npm run preview`.

## Validação antes do uso
Entre com duas contas autorizadas em navegadores distintos e envie mensagens nos dois sentidos. Verifique persistência após recarregar. Uma terceira conta sem registro em `members` deve ter leitura e envio negados, inclusive diretamente pela API. Sem login, a chave pública não deve permitir ler mensagens. Essas verificações precisam de um projeto Supabase configurado e não foram executadas no ambiente de desenvolvimento inicial.

## Escopo desta versão
Mensagens de texto em uma sala familiar. Sem chamadas, anexos, notificações push ou funcionamento offline. Com o aplicativo fechado, não há aviso de novas mensagens. HTTPS protege o transporte, mas esta versão **não oferece criptografia de ponta a ponta**; administradores do banco podem acessar o conteúdo. As regras SQL restringem o acesso a membros autorizados; não há descoberta pública de pessoas nem cadastro pela interface. Não use como canal único para emergências.

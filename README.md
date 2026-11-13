# WhatsFamily
Chat privado por convite, React + API Vercel + Neon Postgres.

## Usar
1. Na Vercel, conecte o banco Neon ao projeto WhatsFamily (Storage → banco → Connect Project). A integração fornece DATABASE_URL ou POSTGRES_URL. Faça novo deploy após conectar. Nunca publique a conexão nem use prefixo VITE_. Redefina senhas de banco que tenham sido expostas.
2. Abra o aplicativo e toque em **Criar família**. Escolha nome, usuário e PIN de 4 números.
3. Guarde o código exibido. No celular da filha, abra o mesmo endereço, toque em **Tenho convite** e crie o acesso dela usando esse código. Compartilhe o código somente com a família.
4. Nas próximas vezes basta **Entrar**. Adicione o endereço à tela inicial pelo navegador.

As tabelas são criadas automaticamente pela API. Famílias diferentes têm salas isoladas. Não é necessário SQL manual, Supabase ou e-mail. O convite tem 10 caracteres e também pode ser compartilhado como link com preenchimento automático. Toque em Convidar para gerar outro; isso invalida o convite anterior, sem remover contas existentes. Quem possui o convite pode entrar. Nesta versão não há recuperação de senha nem painel para remover membros. Guarde os acessos e o convite com cuidado.

## Desenvolvimento
Node 24. `npm ci --cache /tmp/npm-cache`, `npm run build`. Para executar frontend e API juntos use `npx vercel dev` com DATABASE_URL configurada no ambiente do servidor. `npm run dev` serve apenas a interface e não executa a API. Vercel detecta Vite e as funções em api/. Build: npm run build; saída: dist.

## Proteções e limites
Senhas com scrypt e salt, sessões aleatórias de 30 dias em cookies HttpOnly/Secure/SameSite, tokens e convites armazenados como hashes, SQL parametrizado, autorização por sala no servidor, limite persistente por IP e bloqueio de login por usuário por 15 minutos após 5 tentativas incorretas. PINs curtos são menos resistentes a adivinhação que senhas longas. Senhas anteriores continuam funcionando; use Meu PIN dentro da conversa para trocar, confirmando a senha atual. A troca encerra as outras sessões da conta. Conexão de banco somente no servidor. HTTPS obrigatório para cookies de sessão.

Últimas 100 mensagens, atualizadas a cada 3 segundos com o app aberto. Sem chamadas ou notificações push ou criptografia de ponta a ponta. Não use como canal único de emergência. Administradores do banco podem ler conteúdo. Credenciais do banco precisam ser configuradas na Vercel; apenas o frontend não permite conversar.

## Limpar histórico
Na conversa, toque em **Limpar conversa** e confirme. Isso apaga as mensagens anteriores para todos os integrantes daquela família, sem afetar outras famílias ou contas. Mensagens novas, posteriores à última exibida ao confirmar, são preservadas. Não há opção de desfazer.

## Conversas individuais
Os integrantes da mesma família aparecem na barra lateral (menu ☰ no celular). Selecione um nome para conversar em particular ou Nossa família para o grupo. Mensagens antigas permanecem no grupo. A API verifica a família e os dois participantes em cada leitura, envio e exclusão. Limpar conversa apaga somente o histórico selecionado, para seus participantes. A coluna de destinatário é adicionada automaticamente, preservando os dados existentes.

## Mensagens de voz
Toque em Gravar áudio e permita o microfone. Pare, ouça e envie ou descarte. Limite de gravação: 60 segundos e 1 MB. WebM/Opus, MP4 e Ogg são escolhidos conforme o navegador. É necessário HTTPS e um navegador com MediaRecorder. Áudios são armazenados no Neon e entregues por uma rota autenticada, somente para participantes da conversa; a lista de mensagens não baixa os arquivos. Limpar conversa também remove os áudios. O banco armazena os arquivos pequenos para dispensar configuração de Blob; monitore o espaço do plano Neon. A gravação com microfone real em iPhone/Android precisa ser verificada no aparelho.

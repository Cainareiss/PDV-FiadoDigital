# Atualização do PDV — versão 1.0.8

Use `Atualizador-MP-Pedrinhas-PDV-1.0.8.exe` em lugar do atualizador 1.0.7.

1. Conclua as vendas em andamento e feche as telas do PDV.
2. Abra o atualizador e aceite a solicitação de administrador do Windows.
3. Confira a pasta da instalação. Se necessário, clique em **Procurar** e selecione a pasta que contém `MP-Pedrinhas.exe` e `app`.
4. Clique em **Atualizar agora** e confirme. Aguarde a mensagem de conclusão.
5. Abra o PDV pelo atalho habitual. Em telas já abertas, pressione **Ctrl+F5**.

O assistente encerra os processos dessa instalação, faz backup em `backups/antes-da-atualizacao-...` e substitui os arquivos do programa. O banco existente e o `.env` são conferidos por SHA-256 antes e depois. Se o banco configurado não for localizado, a atualização é cancelada antes da cópia dos arquivos do programa. O pacote não contém uma base inicial e não executa migrações ou recadastro de produtos.

As correções incluem o catálogo completo com paginação, atualização das quantidades após reposição, busca no estoque e mensagens como **Código de barras já cadastrado**, **Marca já cadastrada** e **Produto não encontrado**. Um código duplicado informa o nome do produto existente; use o cadastro existente para repor estoque. A duplicidade continua sendo recusada, sem alterar o estoque desse produto.

O caminho da instalação agora é transmitido sem o problema de interpretação da barra final que afetava o atualizador 1.0.7. Os testes cobrem caminhos com espaços, acentos, apóstrofos e colchetes.

Validação local: oito testes das respostas de cadastro em produção, cinco testes do catálogo (incluindo 137 e 501 produtos), compilação da API e interface, verificação do pacote e atualização completa de uma instalação de teste com 137 produtos. Nessa instalação, o banco e o `.env` permaneceram idênticos, as quantidades foram preservadas e os backups foram conferidos. A base real do cliente não foi fornecida para teste.

Se houver uma nova falha, o assistente exibe o caminho do `atualizacao.log`. Guarde esse arquivo e o `app/server.log` da instalação.

# Tabelas Iniciais no Supabase - AppChurch

Este documento e o arquivo [`/supabase/schema.sql`](./schema.sql) contêm o script SQL completo para provisionar as tabelas solicitadas no Supabase.

---

## 🏛️ Modelo Relacional Implementado

```
                           +---------------------------+
                           |         churches          | (Multi-Igreja)
                           +-------------+-------------+
                                         |
                                         | 1:N
                                         v
+------------------------+ 1:N     +-----+---------------------+
|        roles           |<--------+         cells             | (Tabela de Células)
|  (Tabela de Funções)   |         +-------------+-------------+
+-----------+------------+                       |
            |                                    | 1:N
            | 1:N                                v
+-----------v------------+ 1:N     +-------------+-------------+ 1:N     +---------------------------+
|    role_permissions    +-------->|        members            +-------->|    member_track_steps     |
| (Funções x Permissões) |         |   (Tabela de Membros)     |         | (Etapas Feitas no Trilho) |
+-----------+------------+         +-------------+-------------+         +-------------+-------------+
            |                                    |                                     |
            | N:1                                | 1:N                                 | N:1
+-----------v------------+                       |                                     v
|      permissions       |                       |                       +-------------+-------------+
| (Tabela de Permissões) |                       +---------------------->|       etapa_trilhos       |
+------------------------+                                               |     (Tabela de Trilho)    |
                                                                         +---------------------------+
```

---

## 📋 Descrição das Tabelas

### 1. Tabela de Células (`public.cells`)
Armazena os lifegroups/células da congregação.
- `id` (PK TEXT) - ex: `cell-adonai`, `cell-shalom`
- `church_id` (FK `churches.id`)
- `name` (TEXT) - Nome da célula (ex: *Adonai*, *Betel*)
- `leader_name` (TEXT) - Nome do líder principal
- `sector_name` (TEXT) - Setor de supervisão (ex: *Fire*, *Radicais*)
- `address` (TEXT) - Endereço de reunião
- `meeting_day` (TEXT) - Dia da semana
- `meeting_time` (TEXT) - Horário
- `member_count` (INTEGER) - Quantidade de membros ativos

### 2. Tabela de Funções (`public.roles`)
Armazena a hierarquia e atribuições ministeriais.
- `id` (PK TEXT) - ex: `role-pastor`, `role-lider-setor`, `role-lider-celula`, `role-lider-treinamento`, `role-anfitriao`, `role-secretario`, `role-intercessor`, `role-membro`
- `name` (TEXT UNIQUE) - Nome exibido
- `slug` (TEXT UNIQUE)
- `description` (TEXT)
- `hierarchy_level` (INTEGER) - Nível de autoridade (1 a 5)
- `badge_color` (TEXT) - Cor identificadora

### 3. Tabela de Permissões (`public.permissions`)
Catálogo de permissões granulares por módulo.
- `id` (PK TEXT) - ex: `perm-cell-view`, `perm-cell-manage`, `perm-member-create`, `perm-track-update`
- `code` (TEXT UNIQUE) - Código padronizado (ex: `cell:manage`, `track:update`, `reports:view`)
- `name` (TEXT)
- `module` (TEXT) - Célula, Membros, Frequência, Trilho, Relatórios, Feed, Admin
- `description` (TEXT)

#### Tabela de Associação: `public.role_permissions`
- `role_id` (FK `roles.id`)
- `permission_id` (FK `permissions.id`)
- Define automaticamente quais recursos cada Função pode acessar no app.

### 4. Tabela de Membros (`public.members`)
Membros que pertencem a uma célula, com função ministerial e permissões:
- `id` (PK TEXT) - ex: `mem-1`, `mem-2`
- `cell_id` (FK `cells.id`) - **Vínculo obrigatório à Célula**
- `church_id` (FK `churches.id`) - Multi-tenant
- `role_id` (FK `roles.id`) - **Vínculo obrigatório à Função**
- `role` (TEXT) - Nome desnormalizado da função
- `name` (TEXT) - Nome completo do membro
- `login` (TEXT)
- `phone` (TEXT)
- `birthday` (TEXT - dd/MM)
- `neighborhood` (TEXT) - Bairro residencial
- `attendance_status` (TEXT) - `green`, `yellow`, `red`, `black`
- `attendance_percentage` (INTEGER) - % de frequência
- `notes` (TEXT)

#### Permissões Específicas do Membro (`public.member_permissions`)
- Permite conceder ou revogar permissões extras para um membro específico além da sua função padrão.

### 5. Tabela de Trilho de Liderança (`public.etapa_trilhos`)
Catálogo de etapas do Trilho vinculadas a cada congregação/igreja:
- `id` (SERIAL PRIMARY KEY)
- `id_igreja` (UUID REFERENCES `churches.id` ON DELETE CASCADE) - *Permite que cada igreja cadastre e personalize seu próprio trilho de liderança*
- `numero_etapa` (INTEGER)
- `titulo` (TEXT)
  1. *Integração & Boas-Vindas*
  2. *Batismo nas Águas*
  3. *Encontro com Deus*
  4. *Pós-Encontro & Maturidade*
  5. *Escola de Líderes / CTL*
  6. *Líder em Treinamento & Envio*
- `descricao` (TEXT)
- `obrigatoria` (BOOLEAN)

#### Etapas Concluídas pelo Membro (`public.member_track_steps`)
Registra exatamente quais etapas o membro já realizou:
- `id` (UUID PK)
- `membro_id` (FK `members.id`)
- `celula_id` (FK `cells.id`)
- `etapa_id` (FK `etapa_trilhos.id`)
- `concluida` (BOOLEAN)
- `concluida_em` (TEXT / DATE)
- `observacoes` (TEXT)
- `validado_por` (TEXT)

#### Script de Migração para Etapa Trilhos:
Execute [`/supabase/migration_etapa_trilhos.sql`](./migration_etapa_trilhos.sql) no SQL Editor do Supabase para migrar a tabela `track_steps` existente para `etapa_trilhos` e adicionar a coluna `id_igreja`.

#### Resumo de Trilho (`public.leadership_tracks`)
- `member_id` (PK FK `members.id`)
- `current_step_id` (INTEGER)
- `completed_steps_count` (INTEGER)
- `percentage` (INTEGER)
- `status` (TEXT)

---

## 🌳 Hierarquia Flexível e Personalizada (`/supabase/migration_hierarquia_unidades.sql`)

Para congregações com estruturas multiníveis (Distrito, Área, Setor, Célula, Redes, etc.), utilize o arquivo [`/supabase/migration_hierarquia_unidades.sql`](./migration_hierarquia_unidades.sql).

Ele implementa:
- `public.nivel_tipo`: Tipos de nível hierárquico próprios de cada igreja com ordens espaçadas (10, 20, 30, 40...).
- `public.unidades`: Tabela única e recursiva (`pai_id`), com integridade composta multi-tenant `(nivel_tipo_id, igreja_id)`.
- `public.unidade_cobertura`: Cobertura e supervisão lateral entre unidades do mesmo nível.
- `public.celulas`: Extensão 1:1 para atributos específicos de reunião de células.
- `public.unidade_lideres`: Normalização N:N de múltiplos líderes por unidade com papéis específicos (`Líder`, `Co-Líder`, `Líder em Treinamento`, etc.).
- Triggers anti-ciclo para impedir que uma unidade seja ancestral dela mesma.
- View de compatibilidade retroativa `public.vw_cells_legacy`.

---

## 🇧🇷 Migração: Padronização em Português e Consolidação de Células (`/supabase/migration_padronizacao_portugues_unidades.sql`)

Para projetos já existentes que utilizam tabelas em inglês (`churches`, `roles`, `members`, `cells`, etc.), utilize o script [`/supabase/migration_padronizacao_portugues_unidades.sql`](./migration_padronizacao_portugues_unidades.sql).

### Etapas da Migração:
1. **Renomeação de tabelas para português**:
   - `churches` ➔ `igrejas`
   - `roles` ➔ `papeis`
   - `permissions` ➔ `permissoes`
   - `role_permissions` ➔ `papel_permissoes`
   - `members` ➔ `membros`
   - `member_permissions` ➔ `membro_permissoes`
   - `etapa_trilhos` ➔ `etapas_trilha`
   - `member_track_steps` ➔ `membro_etapas_trilha`
   - `leadership_tracks` ➔ `trilhas_lideranca`
   - `feed_posts` ➔ `postagens_feed`
   - `post_comments` ➔ `comentarios_postagem`
   - `announcements` ➔ `avisos`
2. **Renomeação de colunas**:
   - `papel_permissoes.funcao_id` ➔ `papel_id`
   - `membros.funcao_id` ➔ `papel_id`
   - `etapas_trilha.id_igreja` ➔ `igreja_id`
3. **Consolidação de `cells` em `unidades` e `celulas`**:
   - Cria o nível "Célula" em `nivel_tipo` se não existir.
   - Migra os registros legados para `unidades` e os atributos de reunião para `celulas`.
4. **Vínculo de líderes e setores (com revisão manual)**:
   - Queries de revisão manual para conferir correspondências ambíguas antes de aplicar.
5. **Reponte de chaves estrangeiras**:
   - `membros.unidade_id`, `postagens_feed.unidade_id`, `membro_etapas_trilha.unidade_id`, `trilhas_lideranca.unidade_id`.
6. **Remoção de tabelas legadas**:
   - Descarte seguro de `cells` após validação.
7. **Correção de restrições compostas**:
   - Integridade multi-tenant em `unidades` e `nivel_tipo`.

---

## 🚀 Como Aplicar no Supabase

1. Acesse o seu projeto no [Supabase Dashboard](https://supabase.com/dashboard).
2. **Importante**: Faça backup antes de rodar migrações em produção (via Database > Backups ou clone em staging).
3. No menu lateral esquerdo, clique em **SQL Editor**.
4. Clique em **+ New query**.
5. Para uma nova instalação: execute [`/supabase/schema.sql`](./schema.sql).
6. Para migrar um banco existente: execute as etapas de [`/supabase/migration_padronizacao_portugues_unidades.sql`](./migration_padronizacao_portugues_unidades.sql).
7. Clique no botão **Run** (ou pressione `Ctrl + Enter` / `Cmd + Enter`).

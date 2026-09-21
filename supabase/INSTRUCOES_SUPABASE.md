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
| (Tabela de Permissões) |                       +---------------------->|        track_steps        |
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

### 5. Tabela de Trilho de Liderança (`public.track_steps`)
Catálogo oficial das etapas do Trilho:
- `id` (PK INTEGER: 1 a 6)
- `step_number` (INTEGER)
- `title` (TEXT)
  1. *Integração & Boas-Vindas*
  2. *Batismo nas Águas*
  3. *Encontro com Deus*
  4. *Pós-Encontro & Maturidade*
  5. *Escola de Líderes / CTL*
  6. *Líder em Treinamento & Envio*
- `description` (TEXT)
- `required` (BOOLEAN)

#### Etapas Concluídas pelo Membro (`public.member_track_steps`)
Registra exatamente quais etapas o membro já realizou:
- `id` (UUID PK)
- `member_id` (FK `members.id`)
- `cell_id` (FK `cells.id`)
- `step_id` (FK `track_steps.id`)
- `completed` (BOOLEAN)
- `completed_at` (TEXT / DATE)
- `notes` (TEXT)
- `validated_by` (TEXT)

#### Resumo de Trilho (`public.leadership_tracks`)
- `member_id` (PK FK `members.id`)
- `current_step_id` (INTEGER)
- `completed_steps_count` (INTEGER)
- `percentage` (INTEGER)
- `status` (TEXT)

---

## 🚀 Como Aplicar no Supabase

1. Acesse o seu projeto no [Supabase Dashboard](https://supabase.com/dashboard).
2. No menu lateral esquerdo, clique em **SQL Editor**.
3. Clique em **+ New query**.
4. Copie todo o conteúdo do arquivo [`/supabase/schema.sql`](./schema.sql).
5. Cole no editor e clique no botão **Run** (ou pressione `Ctrl + Enter` / `Cmd + Enter`).
6. Todas as tabelas, índices, views (`vw_cell_members_full`, `vw_member_leadership_track`), políticas de RLS e dados iniciais de demonstração serão criados com sucesso!

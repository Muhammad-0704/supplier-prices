-- Назначить первого руководителя. Сначала создайте пользователя:
-- Supabase → Authentication → Users → Add user (email и пароль, галочка Auto Confirm).
-- Потом выполните, подставив его email:

update public.profiles
set role = 'manager'
where id = (select id from auth.users where email = 'you@example.com');

-- Остальных сотрудников руководитель добавляет уже в самом сервисе, на странице «Команда».

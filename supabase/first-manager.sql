-- Назначить первого руководителя. Сначала создайте пользователя:
-- Supabase → Authentication → Users → Add user (email и пароль, галочка Auto Confirm).
-- Потом выполните, подставив его email и имя:

insert into public.profiles (id, full_name, role)
select id, 'Ваше имя', 'manager' from auth.users where email = 'you@example.com'
on conflict (id) do update set role = 'manager';

-- Остальных сотрудников руководитель добавляет уже в самом сервисе, на странице «Команда».

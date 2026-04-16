select id, title, department_id
from public.courses
order by created_at desc
limit 10;
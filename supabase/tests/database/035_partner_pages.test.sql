begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

delete from public.site_partners;
insert into public.site_partners (slug, name, story, services, results, timeline, gallery, cover_url)
values ('safi', 'SAFI', 'Hamkorlik 2024-yilda boshlandi.', array['SMM', 'Reels syomka'],
        '[{"value":"+70%","label":"Savdo hajmi"}]', '[{"period":"2024","title":"Boshlanish","text":"Audit"}]',
        array['https://x.example/a.webp', 'https://x.example/b.webp'], 'https://x.example/cover.webp');

select throws_ok($$insert into public.site_partners (slug, name) values ('safi', 'Boshqa')$$, '23505', null, 'partner addresses are unique');
select throws_ok($$insert into public.site_partners (slug, name) values ('Safi Brand', 'X')$$, '23514', null, 'addresses are lowercase words with dashes');
select throws_ok($$insert into public.site_partners (name) values ('Manzilsiz')$$, '23502', null, 'every partner has an address');
select throws_ok($$update public.site_partners set timeline = '{"a":1}' where slug = 'safi'$$, '23514', null, 'the timeline is a list');
select throws_ok($$update public.site_partners set gallery = array_fill('https://x.example/p.webp'::text, array[25]) where slug = 'safi'$$, '23514', null, 'up to 24 photos');
select throws_ok($$update public.site_partners set story = repeat('a', 6001) where slug = 'safi'$$, '23514', null, 'the story has a length limit');

set local role service_role;
select is(public.get_site_content()->'partners'->0->>'slug', 'safi', 'the site gets the partner page address');
select is(jsonb_array_length(public.get_site_content()->'partners'->0->'gallery'), 2, 'the site gets the photos in order');
select is(public.get_site_content()->'partners'->0->'timeline'->0->>'title', 'Boshlanish', 'the site gets the timeline');
select is(public.get_site_content()->'partners'->0->'services'->>1, 'Reels syomka', 'the site gets what was done');
reset role;

select * from finish();
rollback;

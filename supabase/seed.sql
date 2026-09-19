-- DEVELOPMENT examples only; not verified market prices.
insert into wifi.sites(id,name) values ('00000000-0000-4000-8000-000000000001','BABU-SHOP WIFI') on conflict do nothing;
insert into wifi.packages(id,site_id,name,description,price_tzs,duration_minutes) values
('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','1 Hour','Development example',1000,60),
('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','24 Hours','Development example',2000,1440),
('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000001','7 Days','Development example',8000,10080) on conflict do nothing;

-- Limite de taille par fichier dans le stockage (100 Mo), en plus du contrôle côté application.
-- Empêche d'envoyer un fichier énorme qui viderait le quota de stockage.
update storage.buckets set file_size_limit = 104857600 where id = 'files';

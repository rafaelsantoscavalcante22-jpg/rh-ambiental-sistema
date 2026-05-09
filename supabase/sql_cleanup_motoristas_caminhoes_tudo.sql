-- Limpeza total: motoristas e veículos (caminhões).
-- clientes.caminhao_id referencia caminhoes com ON DELETE SET NULL (fica nulo).
-- caminhoes.motorista_id referencia motoristas com ON DELETE SET NULL.
--
-- Ordem: primeiro caminhoes, depois motoristas.

DELETE FROM public.caminhoes;

DELETE FROM public.motoristas;

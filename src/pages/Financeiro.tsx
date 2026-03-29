import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import { supabase } from "../lib/supabase";

type Coleta = {
  id: string;
  numero: string;
  cliente: string;
  data_agendada: string;
  tipo_residuo: string;
  prioridade: string;
  status: string;
  valor_coleta: number;
};

export default function Financeiro() {
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [loading, setLoading] = useState(true);

  async function carregarDados() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("coletas")
        .select("*")
        .eq("status", "Finalizado");

      if (error) throw error;

      setColetas(data || []);
    } catch (err) {
      console.error(err);
      alert("Erro ao carregar dados do financeiro.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarDados();
  }, []);

  function formatarMoeda(valor: number) {
    return valor?.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  const total = coletas.reduce(
    (acc, item) => acc + (item.valor_coleta || 0),
    0
  );

  return (
    <MainLayout>
      <div style={{ padding: 20 }}>
        {/* 🔴 TESTE VISUAL */}
        <h1 style={{ color: "red" }}>TESTE VERCEL</h1>

        <h2>Financeiro</h2>
        <p>Relatórios e controle financeiro</p>

        <div style={{ marginTop: 20 }}>
          <strong>Total de registros:</strong> {coletas.length}
        </div>

        <div>
          <strong>Valor total:</strong> {formatarMoeda(total)}
        </div>

        <div style={{ marginTop: 20 }}>
          {loading ? (
            <p>Carregando...</p>
          ) : (
            <table width="100%" cellPadding={10}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Resíduo</th>
                  <th>Status</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {coletas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.numero}</td>
                    <td>{c.cliente}</td>
                    <td>{c.data_agendada}</td>
                    <td>{c.tipo_residuo}</td>
                    <td>{c.status}</td>
                    <td>{formatarMoeda(c.valor_coleta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
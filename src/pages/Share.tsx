// Recebe o que foi compartilhado com o ninho: foto de comprovante (Pix/boleto), nota fiscal ou texto.
import { FileText, Receipt, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Proposal } from "../../shared/types";
import { Empty, Heading, Panel, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { takeShared } from "../lib/native";
import { NewTransactionModal } from "../modals/NewTransactionModal";
import { ReceiptModal } from "../modals/ReceiptModal";
import { useApp } from "../state";

type Item = { type: "image"; dataUrl: string } | { type: "text"; text: string };

async function fromPwaCache(): Promise<Item | null> {
  if (!("caches" in window)) return null;
  const cache = await caches.open("ninho-share");
  const file = await cache.match("/shared/file");
  const text = await cache.match("/shared/text");
  await cache.delete("/shared/file");
  await cache.delete("/shared/text");
  if (file) {
    const blob = await file.blob();
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
    return { type: "image", dataUrl };
  }
  if (text) return { type: "text", text: await text.text() };
  return null;
}

/** Imagem menor antes de mandar para a IA. */
async function shrink(dataUrl: string) {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

export function SharePage() {
  const { me, openModal, toast } = useApp();
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const native = await takeShared();
      if (native?.type === "image" && native.dataUrl) return setItem({ type: "image", dataUrl: native.dataUrl });
      if (native?.type === "text" && native.text) return setItem({ type: "text", text: native.text });
      setItem(await fromPwaCache());
    })();
  }, []);

  function propose(proposal: Proposal | null, source: "receipt" | "manual") {
    if (!proposal) return toast("Não encontrei um valor nesse conteúdo. Lance à mão.");
    openModal(<NewTransactionModal proposal={proposal} source={source} />);
  }

  async function readPix() {
    if (item?.type !== "image") return;
    setBusy(true);
    try {
      const { proposal } = await api<{ proposal: Proposal }>("share/pix", { body: { image: await shrink(item.dataUrl) }, silent: true });
      propose(proposal, "receipt");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function readText() {
    if (item?.type !== "text") return;
    setBusy(true);
    try {
      const { proposal } = await api<{ proposal: Proposal | null }>("share/text", { body: { text: item.text }, silent: true });
      propose(proposal, "manual");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading title="Compartilhado com o ninho" subtitle="Comprovantes, notas e mensagens viram lançamentos — você confere antes de salvar." />
      {item === undefined ? (
        <Spinner />
      ) : item === null ? (
        <Panel>
          <Empty
            icon={<Share2 size={28} />}
            title="Nada recebido"
            text="No app do banco ou na galeria, toque em Compartilhar e escolha o ninho. Funciona com foto de comprovante de Pix, boleto ou nota fiscal."
          />
        </Panel>
      ) : item.type === "image" ? (
        <Panel>
          <img className="preview-img" src={item.dataUrl} alt="Imagem compartilhada" style={{ maxHeight: 360, width: "100%", objectFit: "contain" }} />
          <div className="bill-actions" style={{ marginTop: 14 }}>
            <button type="button" className="btn primary" disabled={busy || !me?.aiEnabled} onClick={() => void readPix()}>
              {busy ? <Spinner /> : <FileText size={15} />} É um comprovante (Pix, boleto)
            </button>
            <button type="button" className="btn ghost" onClick={() => openModal(<ReceiptModal initialImage={item.dataUrl} />)}>
              <Receipt size={15} /> É uma nota fiscal
            </button>
          </div>
          {!me?.aiEnabled && <p className="muted small" style={{ marginTop: 8 }}>Ler imagens precisa da chave de IA configurada no servidor.</p>}
        </Panel>
      ) : (
        <Panel>
          <pre className="shared-text">{item.text}</pre>
          <button type="button" className="btn primary" style={{ marginTop: 12 }} disabled={busy} onClick={() => void readText()}>
            {busy && <Spinner />} Transformar em lançamento
          </button>
        </Panel>
      )}
    </>
  );
}

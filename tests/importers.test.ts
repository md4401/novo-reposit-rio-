import { describe, expect, it } from "vitest";
import { parseCsv, parseDate, parseOfx, parseStatement } from "../server/importers";

describe("extratos", () => {
  it("lê datas comuns", () => {
    expect(parseDate("26/10/2026")).toBe("2026-10-26");
    expect(parseDate("26/10/26")).toBe("2026-10-26");
    expect(parseDate("2026-10-26")).toBe("2026-10-26");
    expect(parseDate("20261026120000[-3:BRT]")).toBe("2026-10-26");
    expect(parseDate("31/02/2026")).toBeNull();
  });

  it("CSV estilo Nubank (vírgula, ponto decimal)", () => {
    const rows = parseCsv("date,title,amount\n2026-10-22,Supermercado Pão & Cia,240.00\n2026-10-21,Netflix.com,39.90\n2026-10-20,Pagamento recebido,-1500.00\n");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ occurredOn: "2026-10-22", description: "Supermercado Pão & Cia", signedCents: 24000 });
    expect(rows[2].signedCents).toBe(-150000);
  });

  it("CSV de conta corrente (ponto e vírgula, vírgula decimal, linhas de saldo)", () => {
    const csv = [
      "Agência;0001;Conta;12345-6",
      "Data;Histórico;Valor;Saldo",
      "01/10/2026;SALDO ANTERIOR;;1.000,00",
      "05/10/2026;PIX RECEBIDO SALARIO;4.200,00;5.200,00",
      '06/10/2026;"COMPRA CARTAO PADARIA DA VILA";-37,80;5.162,20',
      "06/10/2026;COMPRA CARTAO PADARIA DA VILA;-37,80;5.124,40",
    ].join("\n");
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0].signedCents).toBe(420000);
    expect(rows[1].signedCents).toBe(-3780);
    // Duas compras idênticas no mesmo dia continuam sendo duas linhas diferentes
    expect(rows[1].externalId).not.toBe(rows[2].externalId);
    // E reimportar o mesmo arquivo gera os mesmos ids (idempotência)
    expect(parseCsv(csv).map((r) => r.externalId)).toEqual(rows.map((r) => r.externalId));
  });

  it("CSV com colunas de débito e crédito", () => {
    const rows = parseCsv("Data,Descrição,Débito,Crédito\n10/10/2026,Posto Estrela,165.00,\n11/10/2026,Estorno,,20.00\n");
    expect(rows.map((r) => r.signedCents)).toEqual([-16500, 2000]);
  });

  it("OFX", () => {
    const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261022<TRNAMT>-240.00<FITID>abc1<MEMO>SUPERMERCADO PAO &amp; CIA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>4200.00<FITID>abc2<NAME>SALARIO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const rows = parseOfx(ofx);
    expect(rows).toEqual([
      { occurredOn: "2026-10-22", description: "SUPERMERCADO PAO & CIA", signedCents: -24000, externalId: "ofx:abc1" },
      { occurredOn: "2026-10-05", description: "SALARIO", signedCents: 420000, externalId: "ofx:abc2" },
    ]);
    expect(parseStatement("extrato.ofx", ofx).format).toBe("ofx");
  });

  it("explica quando o CSV não tem as colunas esperadas", () => {
    expect(() => parseCsv("a,b\n1,2\n")).toThrow(/Data/);
  });
});

describe("bancos reconhecidos pelo CSV", () => {
  it("Nubank cartão: compras positivas viram despesas (inverte)", () => {
    const r = parseStatement("Nubank_2026-10.csv", "date,title,amount\n2026-10-01,Padaria Real,12.50\n2026-10-02,Pagamento recebido,-300.00\n2026-10-03,Uber,23.90\n");
    expect(r.bank).toEqual({ name: "Nubank (cartão)", creditCard: true });
  });
  it("Nubank conta: não inverte", () => {
    const r = parseStatement("NU_conta.csv", "Data,Valor,Identificador,Descrição\n01/10/2026,-45.90,abc,Compra no débito - Mercado\n05/10/2026,3000.00,def,Transferência recebida\n");
    expect(r.bank).toEqual({ name: "Nubank (conta)", creditCard: false });
    expect(r.rows[0].signedCents).toBe(-4590);
  });
  it("C6 cartão: usa o valor em reais e não a coluna em dólar", () => {
    const csv = "Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)\n05/10/2026;MARIA S;1234;Mercado;SUPERMERCADO X;Única;0;0;150,30\n";
    const r = parseStatement("c6.csv", csv);
    expect(r.bank?.name).toBe("C6 (cartão)");
    expect(r.rows[0].signedCents).toBe(15030);
    expect(r.rows[0].description).toBe("SUPERMERCADO X");
  });
  it("cabeçalho de fatura com valores majoritariamente negativos: não inverte", () => {
    const r = parseStatement("x.csv", "date,title,amount\n2026-10-01,Padaria,-12.50\n2026-10-02,Mercado,-30.00\n");
    expect(r.bank?.creditCard).toBe(false);
  });
  it("banco desconhecido: sem detecção", () => {
    expect(parseStatement("x.csv", "Data;Descrição;Valor\n01/10/2026;Mercado;-10,00\n").bank).toBeNull();
  });
});

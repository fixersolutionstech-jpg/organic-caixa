"""
ponte.py — leva os movimentos aprovados na PWA para o Organic, sem nunca escrever no Excel.

Uso:
  python ponte.py                 importa: Sheet -> lote JSON -> organic.py propor (folha Pendentes)
  python ponte.py --seco          mostra o lote que seria criado; não escreve nada
  python ponte.py --saldos        só copia os saldos de Contas para a Sheet (a PWA mostra-os)
  python ponte.py --de ficheiro   usa movimentos de um JSON local (testes); não toca na Sheet

Requer: pip install requests openpyxl
Lê GAS_URL, GAS_TOKEN e ORGANIC_DIR do .env desta pasta (ORGANIC_DIR pode ser também variável de ambiente).
O registo oficial é Contabilidade.xlsx: só scripts/organic.py do Organic escreve nele (fecha o Excel antes).
"""
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from openpyxl import load_workbook

AQUI = Path(__file__).parent

# Contas da PWA -> contas do Organic (Caixa e M-Pesa estão unidos em CASH)
CONTAS = {"Caixa": "CASH", "M-Pesa": "CASH", "e-Mola": "EMOLA", "Banco": "BANCO"}

# Categorias da PWA -> código do Plano_Contas. Patrimoniais tratadas à parte (FIXER).
CAT_SAIDA = {
    "Alimentação": "D-ALIM", "Transporte": "D-TRANS", "Casa": "D-CASA", "Comunicação": "D-COM",
    "Saúde": "D-SAUDE", "Pessoal": "D-OUT", "Lazer": "D-LAZER", "Educação": "D-EDUC",
    "Dízimo": "D-DIZ", "Família": "D-FAM", "Software": "D-SOFT", "Equipamento": "D-EQUIP",
    "Taxas": "D-BANC", "Outros": "D-OUT",
}
CAT_ENTRADA = {"Rendimento": "R-OUT", "Salário": "R-SAL", "Outros": "R-OUT"}
FIXER_SAIDA = "Aporte Fixer"        # -> I-APORTE (alternativa E-CONC: decide o Rei no Organic)
FIXER_ENTRADA = "Reembolso Fixer"   # -> E-REEMB (alternativa I-RESGATE)
IGNORAR = "Saldo inicial"           # os saldos iniciais já estão na folha Contas


def env():
    cfg = {}
    f = AQUI / ".env"
    if f.exists():
        for linha in f.read_text(encoding="utf-8").splitlines():
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                cfg[k.strip()] = v.strip()
    for k in ("GAS_URL", "GAS_TOKEN", "ORGANIC_DIR"):
        if os.environ.get(k):
            cfg[k] = os.environ[k]
    return cfg


def gas(cfg, corpo=None, **params):
    """Chama o GAS. O Google devolve 404/HTML de vez em quando: repete até 4 vezes."""
    for i in range(4):
        try:
            if corpo is None:
                r = requests.get(cfg["GAS_URL"], params={"token": cfg["GAS_TOKEN"], **params}, timeout=60)
            else:
                r = requests.post(cfg["GAS_URL"], data=json.dumps({"token": cfg["GAS_TOKEN"], **corpo}), timeout=60)
            j = r.json()
            break
        except ValueError:
            if i == 3:
                sys.exit("O GAS não devolveu JSON (HTTP %s). Tenta outra vez daqui a pouco." % r.status_code)
            time.sleep(2)
    if not j.get("ok"):
        sys.exit("Erro do GAS: " + str(j.get("erro")))
    return j


def conta(c):
    if c not in CONTAS:
        raise ValueError(f"conta desconhecida na PWA: {c!r}")
    return CONTAS[c]


def para_lote(m):
    """Converte um movimento da PWA num movimento do lote do Organic. Devolve (dict|None, aviso|None)."""
    base = {"data": m["data"], "referencia": m["id"],
            "fonte": "caixa-sms" if m.get("origem") == "sms" else "caixa-pwa", "confianca": "alta"}
    desc = m.get("descricao") or m.get("categoria") or ""
    v = float(m["valor"])
    cat = m.get("categoria", "")
    if m["tipo"] == "transferencia":
        de, para = conta(m["conta"]), conta(m["conta_destino"])
        if de == para:
            return None, f"{m['id']}: transferência entre contas unidas ({m['conta']} -> {m['conta_destino']}) não precisa de registo"
        return {**base, "categoria": "T-INT", "valor": v, "descricao": desc or "Transferência",
                "conta_saida": de, "conta_entrada": para}, None
    c = conta(m["conta"])
    if m["tipo"] == "saida":
        if cat == FIXER_SAIDA:
            return {**base, "categoria": "I-APORTE", "valor": v, "descricao": desc or "Aporte Fixer",
                    "conta_saida": c, "conta_entrada": "INVEST_FIXER", "confianca": "baixa",
                    "nota": "Recomendado: aporte de capital (I-APORTE). Se for empréstimo, corrigir para E-CONC e conta_entrada=EMPREST_FIXER"}, None
        cod = CAT_SAIDA.get(cat)
        if cod is None:
            base["confianca"] = "baixa"
        return {**base, "categoria": cod or "D-OUT", "saida": v, "desc_saida": desc, "conta_saida": c,
                **({"nota": f"Categoria da PWA sem equivalente: {cat!r}"} if cod is None else {})}, None
    if cat == IGNORAR:
        return None, f"{m['id']}: 'Saldo inicial' ignorado (os saldos já estão em Contas)"
    if cat == FIXER_ENTRADA:
        return {**base, "categoria": "E-REEMB", "valor": v, "descricao": desc or "Reembolso Fixer",
                "conta_entrada": c, "conta_saida": "EMPREST_FIXER", "confianca": "baixa",
                "nota": "Recomendado: reembolso de empréstimo (E-REEMB). Se for resgate de capital, corrigir para I-RESGATE e conta_saida=INVEST_FIXER"}, None
    cod = CAT_ENTRADA.get(cat)
    if cod is None:
        base["confianca"] = "baixa"
    return {**base, "categoria": cod or "R-OUT", "entrada": v, "desc_entrada": desc, "conta_entrada": c,
            **({"nota": f"Categoria da PWA sem equivalente: {cat!r}"} if cod is None else {})}, None


def caminhos(cfg):
    base = Path(cfg.get("ORGANIC_DIR", ""))
    xlsx = base / "01_OPERACIONAL" / "Contabilidade" / "Contabilidade.xlsx"
    script = base / "scripts" / "organic.py"
    if not xlsx.exists() or not script.exists():
        sys.exit(f"ORGANIC_DIR inválido (falta Contabilidade.xlsx ou scripts/organic.py): {base}")
    return base, xlsx, script


def saldos(xlsx):
    """Saldo de cada conta = saldo inicial + entradas - saídas do Diario (só leitura)."""
    wb = load_workbook(xlsx, read_only=True, data_only=True)
    ct = list(wb["Contas"].iter_rows(values_only=True))
    h = [str(x or "").strip().lower() for x in ct[0]]
    i_c, i_s = h.index("conta"), next(i for i, x in enumerate(h) if x.startswith("saldo inicial"))
    s = {r[i_c]: float(r[i_s] or 0) for r in ct[1:] if r[i_c]}
    dr = list(wb["Diario"].iter_rows(values_only=True))
    dh = [str(x or "").strip().lower() for x in dr[0]]
    ie, ce = dh.index("entrada (mzn)"), dh.index("conta entrada")
    isd, cs = dh.index("saída (mzn)"), dh.index("conta saída")
    for r in dr[1:]:
        if r[ce] in s and r[ie]:
            s[r[ce]] += float(r[ie])
        if r[cs] in s and r[isd]:
            s[r[cs]] -= float(r[isd])
    wb.close()
    return {k: round(v, 2) for k, v in s.items()}


def main(a):
    cfg = env()
    seco, so_saldos = "--seco" in a, "--saldos" in a
    de = a[a.index("--de") + 1] if "--de" in a else None
    base, xlsx, script = caminhos(cfg)

    if not so_saldos:
        if de:
            movs = json.loads(Path(de).read_text(encoding="utf-8"))
        else:
            movs = gas(cfg, acao="exportar")["movimentos"]
        movs.sort(key=lambda m: (m["data"], m.get("criado_em", "")))
        lote, feitos = [], []
        for m in movs:
            try:
                d, aviso = para_lote(m)
            except ValueError as e:
                print(f"! {m['id']}: {e} — deixado por importar")
                continue
            if aviso:
                print("· " + aviso)
            if d:
                lote.append(d)
            feitos.append(m["id"])
        print(f"{len(movs)} aprovado(s) na PWA -> {len(lote)} para o Organic")
        if seco:
            print(json.dumps(lote, ensure_ascii=False, indent=1))
            return
        if not lote:
            if feitos and not de:
                gas(cfg, {"acao": "importado", "ids": feitos})
            return
        agora = datetime.now().strftime("%Y%m%d-%H%M%S")
        pasta = base / "00_ENTRADA" / "_lotes"
        pasta.mkdir(parents=True, exist_ok=True)
        ficheiro = pasta / f"caixa-{agora}.json"
        ficheiro.write_text(json.dumps(lote, ensure_ascii=False, indent=1), encoding="utf-8")
        bk = xlsx.parent / "backup"
        bk.mkdir(exist_ok=True)
        shutil.copy2(xlsx, bk / f"Contabilidade-{agora}.xlsx")
        r = subprocess.run([sys.executable, str(script), "propor", str(ficheiro)], cwd=str(base))
        if r.returncode != 0:
            sys.exit("organic.py propor falhou (o Excel está aberto?). Nada marcado como importado; corre outra vez.")
        if not de:
            gas(cfg, {"acao": "importado", "ids": feitos})
        print(f"Lote {ficheiro.name} proposto. Aprova em Pendentes: python scripts/organic.py listar / aprovar")

    if so_saldos or not de:
        s = saldos(xlsx)
        gas(cfg, {"acao": "saldos", "saldos": s})
        print("Saldos de Contas enviados para a Sheet:", ", ".join(f"{k} {v:,.2f}" for k, v in s.items() if v))


if __name__ == "__main__":
    main(sys.argv[1:])

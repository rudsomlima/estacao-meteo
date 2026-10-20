"""Gera firmware/src/roots.h com as autoridades raiz que a Cloudflare usa nos certificados (e outras comuns).

Uso:  python firmware/tools/make_roots.py caminho/para/cacert.pem
O cacert.pem é o pacote da Mozilla publicado pelo curl (https://curl.se/ca/cacert.pem). Rode de novo quando quiser
atualizar as raízes e grave o firmware: a validação do HTTPS usa só estas.
"""
import pathlib
import sys

NAMES = [
    "ISRG Root X1", "ISRG Root X2",                                   # Let's Encrypt
    "GTS Root R1", "GTS Root R3", "GTS Root R4",                      # Google Trust Services
    "SSL.com Root Certification Authority RSA", "SSL.com Root Certification Authority ECC",
    "SSL.com TLS RSA Root CA 2022", "SSL.com TLS ECC Root CA 2022",   # SSL.com
    "USERTrust RSA Certification Authority", "USERTrust ECC Certification Authority",
    "Sectigo Public Server Authentication Root R46", "Sectigo Public Server Authentication Root E46",  # Sectigo
    "DigiCert Global Root G2", "DigiCert Global Root G3",             # DigiCert
]


def main(src):
    lines = pathlib.Path(src).read_text(encoding="utf-8").splitlines()
    found = {}
    i = 0
    while i < len(lines) - 1:
        name = lines[i].strip()
        if lines[i + 1].startswith("====") and name in NAMES:
            j = i + 2
            while not lines[j].startswith("-----BEGIN CERTIFICATE-----"):
                j += 1
            k = j
            while not lines[k].startswith("-----END CERTIFICATE-----"):
                k += 1
            found[name] = "\n".join(lines[j:k + 1])
            i = k
        i += 1
    missing = [n for n in NAMES if n not in found]
    if missing:
        sys.exit(f"faltaram no pacote: {missing}")
    out = pathlib.Path(__file__).resolve().parents[1] / "src" / "roots.h"
    body = "\n".join(f"// {n}\n{found[n]}" for n in NAMES)
    out.write_text(
        "#pragma once\n"
        "// Gerado por tools/make_roots.py a partir do pacote de raízes da Mozilla. Não edite à mão.\n"
        "// Autoridades raiz aceitas na validação do HTTPS (as que a Cloudflare usa e outras comuns).\n"
        f'static const char ROOT_CAS[] = R"PEM(\n{body}\n)PEM";\n',
        encoding="utf-8",
        newline="\n",
    )
    print(f"{out}: {len(NAMES)} raízes, {len(body)} bytes")


if __name__ == "__main__":
    main(sys.argv[1])

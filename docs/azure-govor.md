# Azure servis za govor: kako se dobija ključ

Režim "Uživo" koristi Microsoft Azure servis za govor (prepoznavanje govora u realnom vremenu i
glas). Treba vam resurs "Speech" i dva podatka iz njega: **ključ** i **region**.

Cene i besplatna kvota se menjaju. Pre upotrebe proverite aktuelni cenovnik na stranici Azure
Speech; postoji besplatan nivo (F0) sa ograničenom mesečnom kvotom, dovoljan za probu.

## Koraci

1. Napravite nalog na https://portal.azure.com (traži karticu, i za besplatan nivo).
2. "Create a resource" -> pretražite **Speech** -> "Create".
3. Izaberite pretplatu, napravite grupu resursa, **region** (npr. West Europe; to se upisuje
   kao `westeurope`), ime, i nivo cena (**Free F0** za probu, **Standard S0** za rad).
4. Kad se resurs napravi: "Go to resource" -> **Keys and Endpoint**. Kopirajte **KEY 1** i
   **Location/Region**.
5. U aplikaciji: Podešavanja -> "Azure govor" -> nalepite ključ i upišite region -> Sačuvaj.
6. Podešavanja -> "Proveri uređaj": red "Azure govor" treba da bude "U redu".

## Napomene

- Ključ se čuva samo u ovom pregledaču/aplikaciji. Ko ima ključ, troši vašu kvotu; ne delite ga.
- Zvuk i tekst iz režima "Uživo" idu na Microsoft Azure (pored Anthropic-a za prevod).
- Ako se pojavi poruka o ograničenju zahteva, potrošena je besplatna kvota ili je pretplata
  zaustavljena: proverite u Azure portalu.

-- Snapshot di fase sexchat/heat score del fan al momento della vendita, per rendere
-- misurabile in futuro l'efficacia dell'escalation basata sull'heat (non un vero A/B
-- test, ma dati reali su cui ragionare invece di un'ipotesi non verificabile).
ALTER TABLE "Transaction" ADD COLUMN "fanSexchatPhaseAtSale" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "fanHeatScoreAtSale" REAL;

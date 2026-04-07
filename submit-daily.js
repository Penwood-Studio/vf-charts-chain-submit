const { ethers } = require("ethers");

async function main() {
  const siteUrl = process.env.VF_SITE_URL;
  const token = process.env.VF_SITE_TOKEN;
  const rpcUrl = process.env.ELY_RPC_URL;
  const privateKey = process.env.ELY_PRIVATE_KEY;

  if (!siteUrl || !token || !rpcUrl || !privateKey) {
    throw new Error("Missing required environment variables");
  }

  const snapshotRes = await fetch(
    `${siteUrl}/wp-json/vf-charts/v1/github/daily-snapshot?token=${encodeURIComponent(token)}`
  );

  const snapshotData = await snapshotRes.json();

  if (!snapshotData.ok) {
    throw new Error(`Snapshot fetch failed: ${JSON.stringify(snapshotData)}`);
  }

  if (snapshotData.already_submitted) {
    console.log(`Snapshot already submitted: ${snapshotData.tx_hash}`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: 0n,
    data: snapshotData.evm_data_hex
  });

  console.log(`Submitted tx: ${tx.hash}`);

  await tx.wait();

  const markRes = await fetch(
    `${siteUrl}/wp-json/vf-charts/v1/github/mark-submitted?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        snapshot_id: snapshotData.snapshot_id,
        tx_hash: tx.hash
      })
    }
  );

  const markData = await markRes.json();

  if (!markData.ok) {
    throw new Error(`Mark-submitted failed: ${JSON.stringify(markData)}`);
  }

  console.log(`Snapshot ${snapshotData.snapshot_id} marked submitted`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

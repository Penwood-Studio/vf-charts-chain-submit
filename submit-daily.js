const { ethers } = require("ethers");

async function main() {
  const siteUrl = process.env.VF_SITE_URL;
  const token = process.env.VF_SITE_TOKEN;
  const rpcUrl = process.env.ELY_RPC_URL;
  const privateKey = process.env.ELY_PRIVATE_KEY;

  console.log("Starting daily chain submit...");
  console.log("VF_SITE_URL set:", !!siteUrl);
  console.log("VF_SITE_TOKEN set:", !!token);
  console.log("ELY_RPC_URL set:", !!rpcUrl);
  console.log("ELY_PRIVATE_KEY set:", !!privateKey);

  if (!siteUrl || !token || !rpcUrl || !privateKey) {
    throw new Error("Missing required environment variables");
  }

  const snapshotUrl =
    `${siteUrl}/wp-json/vf-charts/v1/github/daily-snapshot?token=${encodeURIComponent(token)}`;

  console.log("Fetching snapshot from:", snapshotUrl.replace(token, "[REDACTED]"));

  const snapshotRes = await fetch(snapshotUrl);
  const snapshotText = await snapshotRes.text();

  console.log("Snapshot HTTP status:", snapshotRes.status);
  console.log("Snapshot raw response:", snapshotText);

  let snapshotData;
  try {
    snapshotData = JSON.parse(snapshotText);
  } catch (err) {
    throw new Error("Snapshot endpoint did not return valid JSON");
  }

  if (!snapshotData.ok) {
    throw new Error(`Snapshot fetch failed: ${JSON.stringify(snapshotData)}`);
  }

  if (snapshotData.already_submitted) {
    console.log(`Snapshot already submitted: ${snapshotData.tx_hash}`);
    return;
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Using wallet address:", wallet.address);

  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: 0n,
    data: snapshotData.evm_data_hex
  });

  console.log(`Submitted tx: ${tx.hash}`);

  await tx.wait();
  console.log("Transaction confirmed");

  const markUrl =
    `${siteUrl}/wp-json/vf-charts/v1/github/mark-submitted?token=${encodeURIComponent(token)}`;

  const markRes = await fetch(markUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      snapshot_id: snapshotData.snapshot_id,
      tx_hash: tx.hash
    })
  });

  const markText = await markRes.text();

  console.log("Mark-submitted HTTP status:", markRes.status);
  console.log("Mark-submitted raw response:", markText);

  let markData;
  try {
    markData = JSON.parse(markText);
  } catch (err) {
    throw new Error("Mark-submitted endpoint did not return valid JSON");
  }

  if (!markData.ok) {
    throw new Error(`Mark-submitted failed: ${JSON.stringify(markData)}`);
  }

  console.log(`Snapshot ${snapshotData.snapshot_id} marked submitted`);
}

main().catch((err) => {
  console.error("Workflow failed:");
  console.error(err);
  process.exit(1);
});

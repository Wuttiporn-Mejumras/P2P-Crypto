async function pullFromPeer(peerUrl) {
  const head = await axios.get(`${peerUrl}/api/chain/head`).then(r=>r.data);
  const myLast = await LedgerBlock.query().orderBy('blockIndex','desc').first();
  if (!myLast || head.blockIndex > myLast.blockIndex) {
    let from = myLast ? myLast.blockIndex : 0;
    while (from < head.blockIndex) {
      const { data: blocks } = await axios.get(`${peerUrl}/api/chain/blocks`, { params: { from, limit: 500 }});
      if (!blocks.length) break;
      await axios.post(`http://localhost:3000/api/chain/ingest`, blocks);
      from = blocks[blocks.length - 1].blockIndex;
    }
  }
}
setInterval(() => peers.forEach(p => pullFromPeer(p).catch(()=>{})), 7000);

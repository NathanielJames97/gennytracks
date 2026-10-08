const PARTY_COLOURS = {
  Labour: '#E4003B', Conservative: '#0087DC', 'Liberal Democrats': '#FAA61A',
  'Scottish National': '#FDF38E', 'Scottish National Party': '#FDF38E',
  'Reform UK': '#12B6CF', 'Democratic Unionist': '#D46A4C',
  'Democratic Unionist Party': '#D46A4C', 'Sinn Féin': '#00654F',
  'Social Democratic and Labour': '#2AA82C', 'Social Democratic & Labour Party': '#2AA82C',
  'Plaid Cymru': '#005B54', Green: '#5EB646', 'Green Party': '#5EB646',
  Independent: '#7A7A7A', Speaker: '#9E9E9E', Alliance: '#F6CB2F',
  'Ulster Unionist': '#48A5EE', 'Traditional Unionist Voice': '#0C3A6A',
};

export function simulateUniformSwing(seats, targetParty, swingPoints) {
  const delta = Number(swingPoints) / 100;
  return (seats || []).map((seat) => {
    const candidates = seat.candidates || [];
    if (candidates.length < 2 || !Number.isFinite(seat.validVotes) || seat.validVotes <= 0) return seat;

    const votesByParty = new Map();
    for (const candidate of candidates) {
      const party = candidate.partyGroup || candidate.party || 'Unspecified';
      votesByParty.set(party, (votesByParty.get(party) || 0) + (candidate.votes || 0));
    }
    const totalVotes = [...votesByParty.values()].reduce((sum, votes) => sum + votes, 0);
    if (!totalVotes) return seat;

    const baselineTarget = (votesByParty.get(targetParty) || 0) / totalVotes;
    const targetShare = Math.max(0, Math.min(1, baselineTarget + delta));
    const otherShare = 1 - baselineTarget;
    const scaleOthers = otherShare > 0 ? (1 - targetShare) / otherShare : 0;
    const projected = [...votesByParty.entries()].map(([party, votes]) => ({
      party,
      share: party === targetParty ? targetShare : (votes / totalVotes) * scaleOthers,
    })).sort((a, b) => b.share - a.share);

    const winner = projected[0];
    const runnerUp = projected[1];
    const baselineWinner = seat.partyGroup;
    const majorityShare = Math.max(0, winner.share - (runnerUp?.share || 0));
    return {
      ...seat,
      party: winner.party,
      partyGroup: winner.party,
      colour: PARTY_COLOURS[winner.party] || '#7A7A7A',
      winnerShare: winner.share,
      majorityShare,
      majority: Math.round(majorityShare * totalVotes),
      resultType: winner.party === baselineWinner ? seat.resultType : 'gain',
      gainedFrom: winner.party === baselineWinner ? seat.gainedFrom : baselineWinner,
      simulated: true,
      simulatedCandidates: projected,
    };
  });
}

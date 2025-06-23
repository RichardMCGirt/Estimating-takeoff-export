const laborRatesByBranch = {
  "Raleigh": {
    beamWrapLabor: 12,
    bbLabor: 14,
    bracketLabor: 10,
    ceilingLabor: 13,
    columnLabor: 11,
    lapLabor: 15,
    louverLabor: 9,
    otherLabor: 10,
    paintLabor: 16,
    shakeLabor: 14,
    shutterLabor: 12,
    tngCeilingLabor: 13
  },
  "Myrtle Beach": {
    beamWrapLabor: 11,
    bbLabor: 13,
    bracketLabor: 9,
    ceilingLabor: 12,
    columnLabor: 10,
    lapLabor: 14,
    louverLabor: 8,
    otherLabor: 9,
    paintLabor: 15,
    shakeLabor: 13,
    shutterLabor: 11,
    tngCeilingLabor: 12
  },
  "Charleston": {
    beamWrapLabor: 10,
    bbLabor: 12,
    bracketLabor: 8,
    ceilingLabor: 11,
    columnLabor: 9,
    lapLabor: 13,
    louverLabor: 7,
    otherLabor: 8,
    paintLabor: 14,
    shakeLabor: 12,
    shutterLabor: 10,
    tngCeilingLabor: 11
  },
  "Charlotte": {
    beamWrapLabor: 13,
    bbLabor: 15,
    bracketLabor: 11,
    ceilingLabor: 14,
    columnLabor: 12,
    lapLabor: 16,
    louverLabor: 10,
    otherLabor: 11,
    paintLabor: 17,
    shakeLabor: 15,
    shutterLabor: 13,
    tngCeilingLabor: 14
  },
  "Greenville": {
    beamWrapLabor: 14,
    bbLabor: 16,
    bracketLabor: 12,
    ceilingLabor: 15,
    columnLabor: 13,
    lapLabor: 17,
    louverLabor: 11,
    otherLabor: 12,
    paintLabor: 18,
    shakeLabor: 16,
    shutterLabor: 14,
    tngCeilingLabor: 15
  },
  "Greensboro": {
    beamWrapLabor: 12,
    bbLabor: 14,
    bracketLabor: 10,
    ceilingLabor: 13,
    columnLabor: 11,
    lapLabor: 15,
    louverLabor: 9,
    otherLabor: 10,
    paintLabor: 16,
    shakeLabor: 14,
    shutterLabor: 12,
    tngCeilingLabor: 13
  },
  "Wilmington": {
    beamWrapLabor: 11,
    bbLabor: 13,
    bracketLabor: 9,
    ceilingLabor: 12,
    columnLabor: 10,
    lapLabor: 14,
    louverLabor: 8,
    otherLabor: 9,
    paintLabor: 15,
    shakeLabor: 13,
    shutterLabor: 11,
    tngCeilingLabor: 12
  }
};

document.getElementById("branchSelect").addEventListener("change", function () {
  const selectedBranch = this.value;
  const rates = laborRatesByBranch[selectedBranch];
  if (!rates) return;

  Object.entries(rates).forEach(([key, value]) => {
    const input = document.querySelector(`input[name="${key}"]`);
    if (input) {
      input.value = `$${parseFloat(value).toFixed(2)}`;
    }
  });
});



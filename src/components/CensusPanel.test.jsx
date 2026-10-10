import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CensusPanel, { CensusOverview } from './CensusPanel';

describe('census presentation', () => {
  it('shows the added age and housing measures with source and aggregation notes', () => {
    render(<CensusPanel seat={{
      electorate: 72000,
      census: {
        population: 98000, age65Plus: 0.21, ownerOccupiedShare: 0.63,
        censusYear: 2021, censusSource: 'ONS Census 2021', censusSourceId: 'ons-census-2021',
        censusMethod: 'ONS MSOA21 to July 2024 PCON24 best-fit lookup',
      },
    }} />);

    expect(screen.getByText('Residents aged 65 and over')).toBeInTheDocument();
    expect(screen.getByText('Owner occupation or shared ownership')).toBeInTheDocument();
    expect(screen.getByText(/housing divides owner-occupied households in Scotland and Northern Ireland, and owned or shared-ownership households in England and Wales/)).toBeInTheDocument();
    expect(screen.getByText('21.0%')).toBeInTheDocument();
    expect(screen.getByText('63.0%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ONS \/ Nomis Census 2021 tables/ })).toHaveAttribute('href', 'https://www.nomisweb.co.uk/census/2021/bulk');
  });

  it('labels Scotland education separately and shows per-metric overview coverage', () => {
    const summary = { census: {
      note: 'All countries are included, with differing census dates.',
      seats: 650,
      metrics: [{
        key: 'TS007', seatKey: 'age65Plus', label: 'Residents aged 65 and over',
        hint: 'Population share.', definition: '65+ share.', unit: 'share', source: 'ONS TS007',
        sourceUrl: 'https://www.nomisweb.co.uk/census/2021/bulk', ticks: ['8%', '18%', '29%', '40%'],
        domain: [0.08, 0.4], coverageByCountry: { England: 543, Wales: 32, Scotland: 57, 'Northern Ireland': 18 },
      }],
    } };

    render(<>
      <CensusPanel seat={{ country: 'Scotland', electorate: 76000, census: {
        population: 100000, age65Plus: 0.2, ownerOccupiedShare: 0.6, scotlandDegreeShare: 0.3,
        censusYear: 2022, censusSource: 'NRS Scotland Census 2022', censusSourceId: 'nrs-census-2022',
        censusMethod: 'NRS OA22 to UKPC24 published lookup',
      } }} />
      <CensusOverview summary={summary} seats={[{ census: { age65Plus: 0.21 } }]} />
    </>);

    expect(screen.getByText('Degree-level qualifications or above (Scotland, age 16+)')).toBeInTheDocument();
    expect(screen.getAllByText(/Census 2022/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Coverage: 650 seats \(England 543, Wales 32, Scotland 57, Northern Ireland 18\)/)).toBeInTheDocument();
  });
});

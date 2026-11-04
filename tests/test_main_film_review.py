"""Conservative offline role suggestions must remain reviewable and preserve curation."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('review_main_films', ROOT / 'scripts/review_main_films.py')
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def fixture(minutes=(100, 10), title='', main=None, source=None):
    films = [{'id': str(i), 'title': f'Film {i}', 'durationMinutes': duration} for i, duration in enumerate(minutes)]
    data = {'screenings': [{'candidateId': f'pass-{i}', 'date': '2026-11-16', 'time': f'{17+i}:00', 'title': title, 'filmIds': [f['id'] for f in films]} for i in range(2)]}
    for screening in data['screenings']:
        if main is not None: screening['mainFilmId'] = main
        if source is not None: screening['mainFilmSource'] = source
    return data, films


class MainFilmReviewTest(unittest.TestCase):
    def test_clear_pair_is_applied_to_every_repeat_with_provisional_provenance(self):
        data, films = fixture()
        groups = review.analyze(data, films)
        self.assertEqual(groups[0]['status'], 'clear-proposal')
        self.assertEqual(review.apply_clear(data, groups), 2)
        for screening in data['screenings']:
            self.assertEqual(screening['mainFilmId'], '0')
            self.assertEqual(screening['mainFilmSource'], 'duration-proposal')
        self.assertEqual(review.analyze(data, films)[0]['status'], 'applied-proposal')
        self.assertEqual(review.apply_clear(data, review.analyze(data, films)), 0)

    def test_named_programme_is_reviewed_and_never_overwritten(self):
        data, films = fixture(title='Foco I')
        groups = review.analyze(data, films)
        self.assertEqual(groups[0]['status'], 'needs-review')
        self.assertEqual(review.apply_clear(data, groups), 0)
        self.assertTrue(all('mainFilmId' not in s for s in data['screenings']))

    def test_reviewed_editorial_title_preserves_collective_without_promoting_longest(self):
        data, films = fixture(title='Autora · colaboración')
        for screening in data['screenings']:
            screening['titleSource'] = 'editorial-reviewed'
        groups = review.analyze(data, films)
        self.assertEqual(groups[0]['status'], 'editorial-title')
        self.assertIsNone(groups[0]['candidateMainFilmId'])
        self.assertEqual(review.apply_clear(data, groups), 0)
        data['screenings'][1].pop('titleSource')
        self.assertEqual(review.analyze(data, films)[0]['status'], 'needs-review')

    def test_manual_roles_override_the_duration_heuristic(self):
        data, films = fixture(main='1')
        self.assertEqual(review.analyze(data, films)[0]['status'], 'confirmed')
        self.assertEqual(review.apply_clear(data, review.analyze(data, films)), 0)
        self.assertTrue(all(s['mainFilmId'] == '1' for s in data['screenings']))

    def test_balanced_medium_pair_missing_and_nonfinite_durations_need_review(self):
        for minutes in [(46, 33), (70, 23), (100, None), (100, 0), (float('inf'), 10)]:
            with self.subTest(minutes=minutes):
                data, films = fixture(minutes=minutes)
                self.assertEqual(review.analyze(data, films)[0]['status'], 'needs-review')
                self.assertEqual(review.apply_clear(data, review.analyze(data, films)), 0)

    def test_multiple_mediummetrages_remain_a_collective_programme(self):
        data, films = fixture(minutes=(44, 40, 39))
        self.assertEqual(review.analyze(data, films)[0]['status'], 'keep-program')

    def test_stale_proposal_is_flagged_after_the_duration_data_changes(self):
        data, films = fixture(minutes=(70, 35), main='0', source='duration-proposal')
        self.assertEqual(review.analyze(data, films)[0]['status'], 'needs-review')
        self.assertEqual(review.apply_clear(data, review.analyze(data, films)), 0)

    def test_checked_in_report_matches_the_complete_current_inventory(self):
        data = json.loads((ROOT / 'data/screenings.json').read_text())
        films = json.loads((ROOT / 'data/films.json').read_text())['films']
        saved = json.loads((ROOT / 'review/main-films.json').read_text())
        self.assertEqual(review.analyze(data, films), saved['groups'])
        self.assertEqual(sum(len(g['screenings']) for g in saved['groups']),
                         sum(len(set(s.get('filmIds', []))) > 1 for s in data['screenings']))


if __name__ == '__main__': unittest.main()

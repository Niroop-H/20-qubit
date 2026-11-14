import unittest
from mah_quantum_adapters import graph_from_csv, example_csv


class TestIndustrialCSVAdapter(unittest.TestCase):
    def test_imports_synthetic_factory_graph_with_stable_node_order(self):
        graph = graph_from_csv(example_csv(), name="Pilot graph")
        self.assertEqual(graph["nodes"], ["Cutting", "Welding", "Inspection"])
        self.assertEqual(graph["edges"], [
            {"source": 0, "target": 1, "weight": 7.0},
            {"source": 1, "target": 2, "weight": 4.0},
            {"source": 0, "target": 2, "weight": 3.0},
        ])
        self.assertEqual(graph["name"], "Pilot graph")

    def test_quoted_commas_and_whitespace_are_valid(self):
        graph = graph_from_csv('source,target,weight\n"Line, One"," Weld ",1.25\n')
        self.assertEqual(graph["nodes"], ["Line, One", "Weld"])
        self.assertEqual(graph["edges"][0]["weight"], 1.25)

    def test_duplicate_and_invalid_edges_rejected(self):
        for source in [
            "source,target,weight\nA,B,1\nB,A,2\n",
            "source,target,weight\nA,A,1\n",
            "source,target,weight\nA,B,-1\n",
            "source,target,weight\nA,B,NaN\n",
            "source,target,weight\nA,B,Infinity\n",
            "source,target,weight\nA,B,0\n",
            "source,target,weight\nA,B,2000\n",
            "source,target,weight\n=SUM(A1),B,1\n",
            "wrong,header,weight\nA,B,1\n",
        ]:
            with self.subTest(source=source):
                with self.assertRaises(ValueError):
                    graph_from_csv(source)

    def test_rejects_oversized_model(self):
        lines = ["source,target,weight"]
        for i in range(11):
            lines.append(f"N{i},N{i+1},1")
        with self.assertRaises(ValueError):
            graph_from_csv("\n".join(lines))


if __name__ == "__main__":
    unittest.main()

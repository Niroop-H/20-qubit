"""MAH Quantum industry API v1 – dependency-free Python integration client.

Only HTTP(S) job submission and result verification. No real QPU/physical
instrument control, remote job queue, or claim of unrestricted 4096-qubit runs.
"""
from __future__ import annotations

import hashlib
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Mapping

JOB_SCHEMA = "MAH-Quantum-Industry-Job/v1"
BATCH_SCHEMA = "MAH-Quantum-Industry-Batch/v1"
RESULT_SCHEMA = "MAH-Quantum-Industry-Result/v1"
MAX_RESPONSE_BYTES = 4 * 1024 * 1024


class IndustryAPIError(Exception):
    """A non-secret error returned by the HTTP gateway."""

    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise IndustryAPIError("Refusing redirect: industry tokens must not be forwarded.", code)


def _sha256(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _json(data: Any) -> bytes:
    return json.dumps(data, ensure_ascii=False, allow_nan=False,
                      separators=(",", ":")).encode("utf-8")


class IndustryClient:
    """Stateless synchronous integration for an approved MAH Quantum deployment.

    The access token belongs on the *customer server*, not in web browsers.
    HTTPS is required except explicitly allowed localhost development.
    """

    def __init__(self, base_url: str, api_key: str, *,
                 timeout_seconds: float = 30,
                 allow_insecure_localhost: bool = False):
        parsed = urllib.parse.urlsplit(base_url.rstrip("/"))
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Base URL must not contain credentials, query, or fragment.")
        local = parsed.hostname in ("localhost", "127.0.0.1", "::1")
        if parsed.scheme != "https" and not (
            allow_insecure_localhost and local and parsed.scheme == "http"
        ):
            raise ValueError("HTTPS required; HTTP is only allowed for explicit local testing.")
        if not parsed.netloc:
            raise ValueError("Base URL must have an explicit host.")
        if not isinstance(api_key, str) or len(api_key) < 32:
            raise ValueError("Provide a strong, server-only API key (at least 32 characters).")
        if not 0 < timeout_seconds <= 180:
            raise ValueError("timeout_seconds must be in (0, 180].")
        self._base = base_url.rstrip("/")
        self._key = api_key
        self._timeout = timeout_seconds
        self._opener = urllib.request.build_opener(_NoRedirect())

    def _request(self, path: str, payload: Mapping[str, Any] | None = None) -> dict:
        headers = {"Accept": "application/json"}
        method = "GET" if payload is None else "POST"
        if payload is not None:
            headers["Authorization"] = "Bearer " + self._key
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            self._base + path,
            data=None if payload is None else _json(payload),
            headers=headers, method=method
        )
        try:
            with self._opener.open(request, timeout=self._timeout) as response:
                content = response.read(MAX_RESPONSE_BYTES + 1)
                if len(content) > MAX_RESPONSE_BYTES:
                    raise IndustryAPIError("Gateway response exceeded 4 MiB.", 413)
        except urllib.error.HTTPError as exc:
            body = exc.read(8192)
            try:
                message = json.loads(body).get("message", "HTTP error")
            except (ValueError, AttributeError):
                message = "HTTP error"
            raise IndustryAPIError(str(message), exc.code) from None
        except urllib.error.URLError as exc:
            raise IndustryAPIError("Cannot reach the configured industry API.") from None
        try:
            parsed = json.loads(content)
        except (TypeError, ValueError) as exc:
            raise IndustryAPIError("Gateway returned invalid JSON.") from exc
        if not isinstance(parsed, dict):
            raise IndustryAPIError("Gateway response must be an object.")
        return parsed

    def capabilities(self) -> dict:
        """Discover real advertised limits. This request does not carry a token."""
        return self._request("/api/v1/capabilities")

    def execute(self, job: Mapping[str, Any]) -> dict:
        """Inspect/execute one circuit or solve one bounded industrial graph."""
        return self._request("/api/v1/execute", job)

    def batch(self, jobs: list[Mapping[str, Any]]) -> dict:
        """Run up to three bounded jobs synchronously; not a background queue."""
        return self._request("/api/v1/batch",
                             {"schema": BATCH_SCHEMA, "jobs": jobs})


def circuit_job(job_id: str, source: str, *, shots: int = 128,
                seed: int = 42, inspect_only: bool = False) -> dict:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}", job_id):
        raise ValueError("Invalid job ID.")
    result = {"schema": JOB_SCHEMA, "jobId": job_id, "kind": "circuit",
              "operation": "inspect" if inspect_only else "execute", "source": source}
    if not inspect_only:
        result.update(shots=shots, seed=seed)
    return result


def optimization_job(job_id: str, graph: Mapping[str, Any], *,
                     shots: int = 256, seed: int = 42) -> dict:
    if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}", job_id):
        raise ValueError("Invalid job ID.")
    return {"schema": JOB_SCHEMA, "jobId": job_id, "kind": "optimization",
            "operation": "execute", "graph": dict(graph),
            "shots": shots, "seed": seed}


def verify_result(request: Mapping[str, Any], response: Mapping[str, Any]) -> bool:
    """Verify canonical SHA-256 provenance and shots, not device correctness.

    JS and Python render some JSON numbers differently (for example 1.0).
    The API therefore provides its exact canonical UTF-8 JSON string; the
    client independently hashes it and matches its decoded semantics.
    """
    if response.get("schema") != RESULT_SCHEMA or response.get("jobId") != request.get("jobId"):
        raise ValueError("Response schema or job identity mismatch.")
    if response.get("physicalQpu") is not False:
        raise ValueError("Result wrongly asserts physical quantum hardware.")
    if response.get("calculationFamily") != request.get("kind"):
        raise ValueError("Result job type does not match request.")
    canonical = response.get("canonicalInputJson")
    if not isinstance(canonical, str):
        raise ValueError("Missing canonical input serialization.")
    if _sha256(canonical) != response.get("inputSha256"):
        raise ValueError("Canonical input fingerprint mismatch.")
    try:
        fields = json.loads(canonical)
    except ValueError as exc:
        raise ValueError("Malformed canonical request proof.") from exc
    if request.get("kind") == "circuit":
        source = request["source"]
        source_digest = _sha256(source)
        if response.get("sourceSha256") != source_digest:
            raise ValueError("Circuit SHA-256 does not match submitted source.")
        if fields != {
            "kind": "circuit",
            "operation": request["operation"],
            "sourceSha256": source_digest,
            "shots": request.get("shots"),
            "seed": request.get("seed"),
        }:
            raise ValueError("Circuit parameters or input hash identity mismatch.")
        if request["operation"] == "inspect":
            if response.get("status") != "inspected":
                raise ValueError("Inspect request returned incorrect status.")
        else:
            if response.get("status") != "completed":
                raise ValueError("Circuit execution incomplete.")
            samples = response["samples"]
            counts = samples["counts"]
            if sum(counts.values()) != request["shots"] or samples["seed"] != request["seed"]:
                raise ValueError("Circuit sample counts or seed do not reconcile.")
    elif request.get("kind") == "optimization":
        graph = response["result"]["graph"]
        input_graph = request["graph"]
        normalized = {
            "name": input_graph["name"].strip(),
            "nodes": [label.strip() for label in input_graph["nodes"]],
            "edges": [
                {"source": min(e["source"], e["target"]),
                 "target": max(e["source"], e["target"]),
                 "weight": e["weight"]}
                for e in input_graph["edges"]
            ],
        }
        if "context" in input_graph:
            normalized["context"] = input_graph["context"]
        if graph != normalized or fields != {
            "kind": "optimization", "graph": graph,
            "shots": request["shots"], "seed": request["seed"],
        }:
            raise ValueError("Optimization result graph does not match submitted model.")
        if response.get("status") != "completed":
            raise ValueError("Optimization execution incomplete.")
        if response["result"]["settings"]["seed"] != request["seed"]:
            raise ValueError("Optimization seed mismatch.")
        if response["result"]["settings"]["shots"] != request["shots"]:
            raise ValueError("Optimization shot budget mismatch.")
        if sum(row["count"] for row in response["result"]["quantum"]["outcomes"]) != request["shots"]:
            raise ValueError("Optimization shot histogram does not reconcile.")
        if (response["result"]["quantum"]["expectedScore"] >
                response["result"]["classical"]["optimum"] + 1e-8):
            raise ValueError("Quantum expected score cannot exceed independently reported optimum.")
    else:
        raise ValueError("Unknown industry job kind.")
    return True


def save_evidence(path: str | Path, result: Mapping[str, Any]) -> Path:
    """Write a complete (not truncated) research result to a local JSON artifact."""
    target = Path(path)
    if target.exists():
        raise FileExistsError("Refusing to overwrite existing scientific evidence.")
    target.write_text(json.dumps(dict(result), ensure_ascii=False, indent=2,
                                 allow_nan=False) + "\n", encoding="utf-8")
    return target

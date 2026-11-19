import { useEffect, useState } from 'react';
import {
  getProjectDockerHubRepository,
  inspectDockerImage,
  listDockerImages,
  pullDockerImage,
  type DockerHubRepository,
  type DockerImagePullProgress,
} from '../lib/api';

interface DockerHubImportPanelProps {
  projectId: string;
  repositoryUrl: string | null;
  onUseImage: (image: { reference: string; exposedPorts: string[] }) => void;
}

export function DockerHubImportPanel({ projectId, repositoryUrl, onUseImage }: DockerHubImportPanelProps) {
  const [repository, setRepository] = useState<DockerHubRepository | null>(null);
  const [selectedTag, setSelectedTag] = useState('latest');
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [progress, setProgress] = useState<DockerImagePullProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!repositoryUrl) { setRepository(null); return; }
    setLoading(true); setError(null); setNotice(null);
    getProjectDockerHubRepository(projectId).then((result) => {
      if (!active) return;
      setRepository(result);
      setSelectedTag(result.tags.find((tag) => tag.name === 'latest')?.name ?? result.tags[0]?.name ?? 'latest');
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not load this Docker Hub repository.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId, repositoryUrl]);

  async function importImage() {
    if (!repository || pulling) return;
    const reference = `${repository.namespace}/${repository.repository}:${selectedTag}`;
    setPulling(true); setError(null); setNotice(null); setProgress({ status: `Starting pull for ${reference}` });
    try {
      await pullDockerImage(reference, setProgress);
      const images = await listDockerImages();
      const shortOfficialReference = reference.replace(/^library\//, '');
      const image = images.find((candidate) => candidate.repositoryTags.some((tag) => tag === reference || tag === shortOfficialReference || tag.endsWith(`/${reference}`)));
      const inspection = image ? await inspectDockerImage(image.id) : null;
      const exposedPorts = inspection?.config.exposedPorts.filter((port) => {
        if (!/^\d{1,5}\/tcp$/i.test(port)) return false;
        const number = Number(port.split('/')[0]);
        return number >= 1 && number <= 65535;
      }).slice(0, 8) ?? [];
      setNotice(`${reference} is ready. DockerPilot found ${exposedPorts.length} exposed TCP ${exposedPorts.length === 1 ? 'port' : 'ports'}.`);
      setProgress(null);
      onUseImage({ reference, exposedPorts });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import this image.');
    } finally { setPulling(false); }
  }

  if (!repositoryUrl) return null;
  const progressPercent = progress?.total && progress.total > 0 ? Math.min(100, Math.round((progress.current ?? 0) / progress.total * 100)) : null;

  return <section className="dockerhub-panel" aria-labelledby="dockerhub-import-heading">
    <div className="dockerhub-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> IMAGE SOURCE</div><h2 id="dockerhub-import-heading">Docker Hub</h2><p>Browse a public image, pull it to your Docker Engine, and start a Compose environment from it.</p></div><a className="secondary-button" href={repositoryUrl} target="_blank" rel="noreferrer">Open on Docker Hub ↗</a></div>
    {loading ? <p className="dockerhub-message" role="status">Checking the public repository and its tags…</p> : repository ? <>
      <div className="dockerhub-repository"><strong>{repository.namespace}/{repository.repository}</strong><span>{repository.pullCount.toLocaleString()} pulls</span><span>{repository.starCount.toLocaleString()} stars</span>{repository.lastUpdated && <span>Updated {new Date(repository.lastUpdated).toLocaleDateString()}</span>}</div>
      {repository.description && <p className="dockerhub-description">{repository.description}</p>}
      <div className="dockerhub-import-controls"><label className="form-field"><span>Image tag</span><select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)} disabled={pulling || repository.tags.length === 0}>{repository.tags.map((tag) => <option key={tag.name} value={tag.name}>{tag.name}</option>)}</select></label><button className="primary-button" type="button" onClick={() => void importImage()} disabled={pulling || !repository.tags.length}>{pulling ? 'Pulling image…' : 'Pull image and create Compose draft'}</button></div>
      {!repository.tags.length && <p className="dockerhub-message">No public image tags were found for this repository.</p>}
      {pulling && progress && <div className="dockerhub-progress" role="status" aria-live="polite"><span>{progress.id ? `${progress.id}: ` : ''}{progress.status}</span>{progressPercent !== null && <span>{progressPercent}%</span>}<progress max="100" value={progressPercent ?? undefined} aria-label="Image pull progress" /></div>}
    </> : null}
    {notice && <p className="form-message success-message" role="status">{notice} The Compose editor is ready below.</p>}
    {error && <p className="form-message error-message" role="alert">{error}</p>}
    <p className="dockerhub-footnote">Public images need no Docker Hub token. Private repositories aren’t supported in this flow. DockerPilot detects exposed TCP ports from the pulled image and publishes them on localhost when it creates the draft.</p>
  </section>;
}

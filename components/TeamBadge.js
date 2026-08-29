import Image from "next/image";

export default function TeamBadge({ team }) {
  return <span className="teamBadge"><Image className="teamLogoMini" src={team.logo} alt={`${team.name} logo`} width={42} height={49} /><span><b>{team.short}</b><span>{team.name}</span></span></span>;
}

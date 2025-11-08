Using TLS + "Attestation Transparency" to do attestation with browsers:
* https://www2.eecs.berkeley.edu/Pubs/TechRpts/2016/EECS-2016-12.pdf
* https://jbeekman.nl/site/publications/attestation-transparency.pdf 
* https://escholarship.org/content/qt0jn0n1xs/qt0jn0n1xs.pdf

Some build-time security explanations:
* https://docs.google.com/presentation/d/13wiv0xXXMEmoUX0H8XgIUSH2gsLnvUTxA8_PaYPJxFw/edit#slide=id.gedba26a291_0_259
* https://dlorenc.medium.com/zero-trust-supply-chain-security-e3fb8b6973b8

TPM basics:
* https://opensecuritytraining.info/IntroToTrustedComputing.html

SEV Measurements:
* https://www.youtube.com/watch?v=7R0rnQfi86I
* https://github.com/virtee/sev-snp-measure 

Building Custom Alpine Images:
* https://gitlab.alpinelinux.org/alpine/cloud/alpine-cloud-images

Startup using attestation and nix:
https://yaxi.tech

Building Nix images:
https://nixos.org/manual/nixpkgs/stable/#sec-make-disk-image
https://github.com/NixOS/nixpkgs/blob/nixos-23.05/nixos/lib/make-disk-image.nix
https://calcagno.blog/m1dev/
https://nixos.mayflower.consulting/blog/2018/09/11/custom-images/
http://jackkelly.name/blog/archives/2020/08/30/building_and_importing_nixos_amis_on_ec2/
https://github.com/astro/microvm.nix

SystemD units in Nix:
https://nixos.wiki/wiki/Extend_NixOS

Nix Secureboot:
https://github.com/nix-community/lanzaboote/

Nix SrvOs:
https://numtide.com/blog/donating-srvos-to-nix-community/

Alpine VM image builder
https://github.com/alpinelinux/alpine-make-vm-image/blob/master/alpine-make-vm-image

AWS's OVMF variant:
https://github.com/aws/uefi
Linked from https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/snp-concepts.html

Good blog post explaining UEFI and OVMF:
https://joonas.fi/2021/02/uefi-pc-boot-process-and-uefi-with-qemu/#managing-boot-options-from-os

Arch linux UEFI docs:
https://wiki.archlinux.org/title/Unified_Extensible_Firmware_Interface#UEFI_variables
https://wiki.archlinux.org/title/EFISTUB#efibootmgr

EFIVar tool:
https://github.com/rhboot/efivar

OpenRC scripts:
https://github.com/OpenRC/openrc/blob/master/service-script-guide.md

Getting the guest VM state:
https://listman.redhat.com/archives/edk2-devel-archive/2020-November/msg00969.html
https://github.com/AMDESE/sev-guest/issues/10
https://github.com/spiffe/spire/issues/4469

Not quite all the way:
https://research.ibm.com/publications/securing-linux-vm-boot-with-amd-sev-measurement

Use LUKS cryptsetup / veritysetup:
https://gitlab.com/cryptsetup/cryptsetup/G

Running SEV images in QEMU:
https://blog.hansenpartnership.com/deploying-encrypted-images-for-confidential-computing/

Secure early boot (taking OVMF security seriously):
https://decentriq.notion.site/Swiss-cheese-to-cheddar-securing-AMD-SEV-SNP-early-boot-R-9927b637d4914745a907f04bc651110b

Talk from them:
https://www.youtube.com/watch?v=etYgXdBAz_k

Separate practical talk about running in enclaves:
https://www.youtube.com/watch?v=mpq2yrKk6JU


Azure Custom Firmware:
https://www.youtube.com/watch?v=1gRaL8BCKhE

Project Oak's attestation flow:
https://github.com/project-oak/oak/blob/main/docs/remote-attestation.md

OC3 talks:
https://www.oc3.dev/speakers-and-talks

Azure SEV SNP VM:
https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/
DC2as v5 - $62.7800/month

fosdem 2024 track:
https://fosdem.org/2024/schedule/track/confidential-computing/

Mkosi - tool for making OS images
https://github.com/systemd/mkosi

Notionally it supports dm-verity out of the box:
https://0pointer.net/blog/mkosi-a-tool-for-generating-os-images.html

DICE:
https://www.youtube.com/watch?v=SitfZLoEFww

https://github.com/google/open-dice/blob/main/docs/specification.md

DICE at OC3:
https://www.youtube.com/watch?v=LaT_vgz3Dd4

import { defineStore } from 'pinia'
import { computed } from 'vue'
import type { NegotiationResult, Player, Team, TransferOffer } from '../types/game'
import { formatMoney } from '../utils/random'
import { DIVISION_LABELS, DIVISIONS } from '../data/divisions'
import { durationLabel, loanFee, LOAN_OUT_FEE_PER_ROUND } from '../data/loans'
import { askingPriceOf, marketValue, useGameStore } from './game'

export const MAX_ATTEMPTS_PER_ROUND = 3
/** Abaixo desta fração do preço pedido, a proposta é recusada sem contraproposta. */
const COUNTER_THRESHOLD = 0.7
/** Fração do valor de mercado recebida numa venda imediata. */
export const QUICK_SALE_RATIO = 0.7

function roundToThousand(value: number) {
  return Math.round(value / 1000) * 1000
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min)
}

export interface MarketPlayer {
  player: Player
  team: Team
  value: number
  /** Motivo pelo qual o seu clube não pode negociar com o dono (série acima), ou null. */
  locked: string | null
}

/**
 * Regras do mercado. O estado (propostas, histórico, tentativas) vive na store do jogo,
 * para ser salvo e zerado junto com a carreira.
 */
export const useTransferStore = defineStore('transfers', () => {
  const game = useGameStore()

  const aiTeams = computed(() => game.teams.filter((t) => t.id !== game.managedTeamId))

  /**
   * Regra de divisão: um clube só contrata (compra ou empréstimo) de clubes da mesma série ou de séries abaixo.
   * Retorna o motivo do bloqueio, ou null se a negociação é permitida.
   */
  function divisionBlocker(buyerTeamId: string, sellerTeamId: string): string | null {
    const buyer = game.getTeam(buyerTeamId)
    const seller = game.getTeam(sellerTeamId)
    if (!buyer || !seller) return null
    if (DIVISIONS.indexOf(buyer.division) <= DIVISIONS.indexOf(seller.division)) return null
    return buyer.id === game.managedTeamId
      ? `O ${seller.name} é da ${DIVISION_LABELS[seller.division]} e não negocia com clubes de séries abaixo.`
      : `O ${buyer.name} é de uma série abaixo e não pode contratar do ${seller.name}.`
  }

  /** Clubes da IA que podem levar jogadores do seu clube: mesma série ou acima, e com vaga. */
  const eligibleBuyers = computed(() =>
    aiTeams.value.filter((t) => game.hasSquadRoom(t.id) && !divisionBlocker(t.id, game.managedTeamId ?? '')),
  )

  const marketPlayers = computed<MarketPlayer[]>(() =>
    // Emprestados (inclusive os seus cedidos à IA) não estão à venda.
    aiTeams.value.flatMap((team) =>
      team.players
        .filter((p) => !p.loan)
        .map((player) => ({
          player,
          team,
          value: marketValue(player),
          locked: divisionBlocker(game.managedTeamId ?? '', team.id),
        })),
    ),
  )

  const offersByPlayer = computed(() => {
    const map: Record<string, TransferOffer[]> = {}
    for (const offer of game.transferOffers) (map[offer.playerId] ??= []).push(offer)
    for (const list of Object.values(map)) list.sort((a, b) => b.amount - a.amount)
    return map
  })

  /** Preço que o clube vendedor realmente aceita (não é exibido ao jogador). */
  function askingPrice(player: Player) {
    return roundToThousand(marketValue(player) * (player.starter ? 1.35 : 1.1))
  }

  function attemptsLeft(playerId: string) {
    return MAX_ATTEMPTS_PER_ROUND - (game.negotiationAttempts[playerId] ?? 0)
  }

  function recordTransfer(player: Player, fromTeamId: string, toTeamId: string, amount: number) {
    game.transferHistory.unshift({
      playerName: player.name,
      position: player.position,
      fromTeamId,
      toTeamId,
      amount,
      season: game.season,
      round: game.round + 1,
    })
    game.transferOffers = game.transferOffers.filter((o) => o.playerId !== player.id)
  }

  // --- Compra ---

  function makeOffer(playerId: string, sellerTeamId: string, amount: number): NegotiationResult {
    const seller = game.getTeam(sellerTeamId)
    const player = seller?.players.find((p) => p.id === playerId)
    const buyerId = game.managedTeamId
    if (!seller || !player || !buyerId) return { status: 'rejected', message: 'Jogador indisponível.' }
    const locked = divisionBlocker(buyerId, sellerTeamId)
    if (locked) return { status: 'rejected', message: locked }
    if (attemptsLeft(playerId) <= 0) {
      return { status: 'rejected', message: `O ${seller.name} não quer mais negociar nesta rodada.` }
    }
    if (amount <= 0 || amount > game.budget) return { status: 'rejected', message: 'Você não tem caixa para essa proposta.' }
    if (!game.hasSquadRoom(buyerId)) return { status: 'rejected', message: 'Seu elenco já está no limite de jogadores.' }
    const blocker = game.releaseBlocker(sellerTeamId, playerId)
    if (blocker) return { status: 'rejected', message: blocker }

    game.negotiationAttempts[playerId] = (game.negotiationAttempts[playerId] ?? 0) + 1
    const asking = askingPrice(player)

    if (amount >= asking) {
      game.transferPlayer(playerId, sellerTeamId, buyerId, amount)
      recordTransfer(player, sellerTeamId, buyerId, amount)
      game.addNews(`${player.name} é o novo reforço! Contratado do ${seller.name} por ${formatMoney(amount)}.`)
      return { status: 'accepted', message: `Proposta aceita! ${player.name} agora é seu jogador.` }
    }
    if (amount >= asking * COUNTER_THRESHOLD) {
      return {
        status: 'counter',
        askingPrice: asking,
        message: `O ${seller.name} recusou, mas libera ${player.name} por ${formatMoney(asking)}.`,
      }
    }
    return { status: 'rejected', message: `O ${seller.name} considerou a proposta muito baixa.` }
  }

  // --- Venda ---

  function acceptOffer(offerId: string) {
    const offer = game.transferOffers.find((o) => o.id === offerId)
    const sellerId = game.managedTeamId
    if (!offer || !sellerId) return 'Proposta não encontrada.'
    const blocker = game.releaseBlocker(sellerId, offer.playerId) ?? divisionBlocker(offer.fromTeamId, sellerId)
    if (blocker) return blocker
    if (!game.hasSquadRoom(offer.fromTeamId)) return 'O clube comprador não tem mais vaga no elenco.'

    const player = game.transferPlayer(offer.playerId, sellerId, offer.fromTeamId, offer.amount)
    if (!player) return 'Jogador não encontrado.'
    recordTransfer(player, sellerId, offer.fromTeamId, offer.amount)
    game.addNews(`${player.name} foi vendido ao ${game.getTeam(offer.fromTeamId)?.name} por ${formatMoney(offer.amount)}.`)
    return null
  }

  function rejectOffer(offerId: string) {
    game.transferOffers = game.transferOffers.filter((o) => o.id !== offerId)
  }

  function quickSalePrice(player: Player) {
    return roundToThousand(marketValue(player) * QUICK_SALE_RATIO)
  }

  /** Vende na hora, com deságio, para um clube da IA com vaga. */
  function quickSell(playerId: string) {
    const sellerId = game.managedTeamId
    const player = game.managedTeam?.players.find((p) => p.id === playerId)
    if (!sellerId || !player) return 'Jogador não encontrado.'
    const blocker = game.releaseBlocker(sellerId, playerId)
    if (blocker) return blocker
    const buyers = eligibleBuyers.value
    if (!buyers.length) return 'Nenhum clube da sua série ou de séries acima tem vaga no elenco agora.'

    const buyer = buyers[Math.floor(Math.random() * buyers.length)]!
    const price = quickSalePrice(player)
    game.transferPlayer(playerId, sellerId, buyer.id, price)
    recordTransfer(player, sellerId, buyer.id, price)
    game.addNews(`${player.name} foi negociado às pressas com o ${buyer.name} por ${formatMoney(price)}.`)
    return null
  }

  // --- Empréstimos ---

  /** 0 = até o fim da temporada; nunca passa das rodadas que faltam. */
  function resolveLoanRounds(rounds: number) {
    const left = game.roundsLeftInSeason
    return rounds <= 0 ? left : Math.min(rounds, left)
  }

  function borrowFee(player: Player, rounds: number) {
    return loanFee(marketValue(player), resolveLoanRounds(rounds))
  }

  function lendFee(player: Player, rounds: number) {
    return loanFee(marketValue(player), resolveLoanRounds(rounds), LOAN_OUT_FEE_PER_ROUND)
  }

  /** Por que o clube da IA não empresta esse jogador (ou null se empresta). */
  function borrowBlocker(playerId: string, ownerTeamId: string, rounds: number): string | null {
    const owner = game.getTeam(ownerTeamId)
    const player = owner?.players.find((p) => p.id === playerId)
    const myId = game.managedTeamId
    if (!owner || !player || !myId) return 'Jogador indisponível.'
    const locked = divisionBlocker(myId, ownerTeamId)
    if (locked) return locked
    if (game.roundsLeftInSeason <= 0) return 'A temporada acabou: empréstimos só na próxima.'
    if (player.star) return `O ${owner.name} não empresta jogadores estrela.`
    if (player.starter) return `${player.name} é titular no ${owner.name}, que não abre mão dele.`
    if (!game.hasSquadRoom(myId)) return 'Seu elenco já está no limite de jogadores.'
    const blocker = game.releaseBlocker(ownerTeamId, playerId)
    if (blocker) return blocker
    if (borrowFee(player, rounds) > game.budget) return 'Você não tem caixa para a taxa do empréstimo.'
    return null
  }

  function borrowPlayer(playerId: string, ownerTeamId: string, rounds: number): NegotiationResult {
    const blocker = borrowBlocker(playerId, ownerTeamId, rounds)
    if (blocker) return { status: 'rejected', message: blocker }
    const owner = game.getTeam(ownerTeamId)!
    const player = owner.players.find((p) => p.id === playerId)!
    const total = resolveLoanRounds(rounds)
    const fee = borrowFee(player, rounds)
    game.startLoan(playerId, ownerTeamId, game.managedTeamId!, total, fee)
    game.addNews(`🔁 ${player.name} chega emprestado do ${owner.name} por ${durationLabel(total)} (taxa ${formatMoney(fee)}).`)
    return { status: 'accepted', message: `${player.name} vem emprestado por ${durationLabel(total)}.` }
  }

  function lendBlocker(playerId: string): string | null {
    const myId = game.managedTeamId
    if (!myId) return 'Sem clube.'
    if (game.roundsLeftInSeason <= 0) return 'A temporada acabou: empréstimos só na próxima.'
    if (!aiTeams.value.some((t) => game.hasSquadRoom(t.id))) return 'Nenhum clube tem vaga no elenco agora.'
    return game.releaseBlocker(myId, playerId)
  }

  /**
   * Cede um jogador seu a um clube da IA. Clubes mais modestos (que precisam de reforço) são
   * os mais prováveis interessados; o jogador volta ao fim do prazo.
   */
  function lendPlayer(playerId: string, rounds: number) {
    const blocker = lendBlocker(playerId)
    if (blocker) return blocker
    const player = game.managedTeam!.players.find((p) => p.id === playerId)!
    const candidates = aiTeams.value
      .filter((t) => game.hasSquadRoom(t.id))
      .sort((a, b) => a.reputation - b.reputation)
    const pool = candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 2)))
    const club = pool[Math.floor(Math.random() * pool.length)]!
    const total = resolveLoanRounds(rounds)
    const fee = lendFee(player, rounds)
    game.startLoan(playerId, game.managedTeamId!, club.id, total, fee)
    game.addNews(`🔁 ${player.name} foi emprestado ao ${club.name} por ${durationLabel(total)} (você recebe ${formatMoney(fee)}).`)
    return null
  }

  /** Devolve antes do prazo; a taxa já paga não é reembolsada. */
  function returnEarly(playerId: string) {
    game.endLoan(playerId, 'devolvido antes do prazo')
  }

  function shuffledBuyers() {
    return [...eligibleBuyers.value].sort(() => Math.random() - 0.5)
  }

  function offerId(playerId: string, buyerId: string) {
    return `${playerId}-${buyerId}-${game.season}-${game.round}`
  }

  /**
   * Jogador listado: clubes interessados avaliam entre 80% e 125% do valor de mercado.
   * Se alguém valoriza acima do preço pedido, compra na hora por esse preço;
   * senão, os que chegam perto (70% do pedido) mandam proposta para você decidir.
   */
  function handleListedPlayer(player: Player, offers: TransferOffer[]) {
    const sellerId = game.managedTeamId!
    if (Math.random() >= saleInterest(player).chance) return

    const asking = askingPriceOf(player)
    const interested = shuffledBuyers().slice(0, 1 + Number(Math.random() < 0.5) + Number(Math.random() < 0.2))
    const bids = interested
      .map((team) => ({ team, valuation: marketValue(player) * randomBetween(0.8, 1.25) }))
      .sort((a, b) => b.valuation - a.valuation)

    const buyer = bids.find((b) => b.valuation >= asking)
    if (buyer && !game.releaseBlocker(sellerId, player.id)) {
      game.transferPlayer(player.id, sellerId, buyer.team.id, asking)
      recordTransfer(player, sellerId, buyer.team.id, asking)
      game.addNews(`💰 ${player.name} foi vendido ao ${buyer.team.name} pelo preço pedido: ${formatMoney(asking)}.`)
      return
    }
    for (const { team, valuation } of bids) {
      if (valuation < asking * 0.7) continue
      offers.push({ id: offerId(player.id, team.id), playerId: player.id, fromTeamId: team.id, amount: roundToThousand(valuation) })
    }
  }

  /**
   * Chamado ao fim de cada rodada: substitui as propostas anteriores por novas.
   * Listados podem ser vendidos na hora pelo preço pedido; destaques não listados recebem propostas às vezes.
   */
  function generateOffers() {
    const team = game.managedTeam
    if (!team) return
    const offers: TransferOffer[] = []
    const avgOverall = team.players.reduce((sum, p) => sum + p.overall, 0) / team.players.length

    // Cópia: vendas automáticas tiram jogadores do elenco durante o laço.
    for (const player of [...team.players]) {
      if (player.loan) continue
      if (player.forSale) {
        handleListedPlayer(player, offers)
        continue
      }
      if (player.overall < avgOverall + 4 || Math.random() >= 0.06) continue
      const buyer = shuffledBuyers()[0]
      if (!buyer) continue
      offers.push({
        id: offerId(player.id, buyer.id),
        playerId: player.id,
        fromTeamId: buyer.id,
        amount: roundToThousand(marketValue(player) * randomBetween(1.15, 1.45)),
      })
    }

    game.transferOffers = offers
    if (offers.length) {
      game.addNews(`Você recebeu ${offers.length} proposta${offers.length > 1 ? 's' : ''} por jogadores do elenco.`)
    }
  }

  /**
   * Quanto o mercado se interessa por um jogador listado, pela relação preço pedido / valor.
   * Abaixo do valor quase sempre aparece alguém; muito acima, quase ninguém.
   */
  function saleInterest(player: Player) {
    const ratio = askingPriceOf(player) / Math.max(marketValue(player), 1)
    const chance = Math.min(0.9, Math.max(0.05, 0.85 - 0.9 * (ratio - 0.85)))
    const level =
      ratio <= 0.95
        ? { label: 'Alto', tone: 'good' }
        : ratio <= 1.15
          ? { label: 'Médio', tone: 'accent' }
          : ratio <= 1.4
            ? { label: 'Baixo', tone: 'warn' }
            : { label: 'Muito baixo', tone: 'bad' }
    return { ratio, chance, ...level }
  }

  return {
    marketPlayers, offersByPlayer,
    divisionBlocker, attemptsLeft, makeOffer, acceptOffer, rejectOffer, quickSalePrice, quickSell, generateOffers, saleInterest,
    resolveLoanRounds, borrowFee, lendFee, borrowBlocker, borrowPlayer, lendBlocker, lendPlayer, returnEarly,
  }
})

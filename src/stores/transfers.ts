import { defineStore } from 'pinia'
import { computed } from 'vue'
import type { NegotiationResult, Player, Team, TransferOffer } from '../types/game'
import { formatMoney } from '../utils/random'
import { marketValue, useGameStore } from './game'

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
}

/**
 * Regras do mercado. O estado (propostas, histórico, tentativas) vive na store do jogo,
 * para ser salvo e zerado junto com a carreira.
 */
export const useTransferStore = defineStore('transfers', () => {
  const game = useGameStore()

  const aiTeams = computed(() => game.teams.filter((t) => t.id !== game.managedTeamId))

  const marketPlayers = computed<MarketPlayer[]>(() =>
    aiTeams.value.flatMap((team) => team.players.map((player) => ({ player, team, value: marketValue(player) }))),
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
    const blocker = game.releaseBlocker(sellerId, offer.playerId)
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
    const buyers = aiTeams.value.filter((t) => game.hasSquadRoom(t.id))
    if (!buyers.length) return 'Nenhum clube tem vaga no elenco agora.'

    const buyer = buyers[Math.floor(Math.random() * buyers.length)]!
    const price = quickSalePrice(player)
    game.transferPlayer(playerId, sellerId, buyer.id, price)
    recordTransfer(player, sellerId, buyer.id, price)
    game.addNews(`${player.name} foi negociado às pressas com o ${buyer.name} por ${formatMoney(price)}.`)
    return null
  }

  /**
   * Chamado ao fim de cada rodada: substitui as propostas anteriores por novas.
   * Jogadores listados recebem propostas com frequência; destaques não listados, às vezes.
   */
  function generateOffers() {
    const team = game.managedTeam
    if (!team) return
    const offers: TransferOffer[] = []
    const avgOverall = team.players.reduce((sum, p) => sum + p.overall, 0) / team.players.length

    for (const player of team.players) {
      const isStandout = player.overall >= avgOverall + 4
      const [chance, minFactor, maxFactor] = player.forSale
        ? [0.65, 0.75, 1.15]
        : isStandout
          ? [0.06, 1.15, 1.45]
          : [0, 0, 0]
      if (Math.random() >= chance) continue

      const buyers = aiTeams.value
        .filter((t) => game.hasSquadRoom(t.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, player.forSale && Math.random() < 0.4 ? 2 : 1)
      for (const buyer of buyers) {
        offers.push({
          id: `${player.id}-${buyer.id}-${game.season}-${game.round}`,
          playerId: player.id,
          fromTeamId: buyer.id,
          amount: roundToThousand(marketValue(player) * randomBetween(minFactor, maxFactor)),
        })
      }
    }

    game.transferOffers = offers
    if (offers.length) {
      game.addNews(`Você recebeu ${offers.length} proposta${offers.length > 1 ? 's' : ''} por jogadores do elenco.`)
    }
  }

  return {
    marketPlayers, offersByPlayer,
    attemptsLeft, makeOffer, acceptOffer, rejectOffer, quickSalePrice, quickSell, generateOffers,
  }
})
